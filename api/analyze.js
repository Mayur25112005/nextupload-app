// Vercel serverless function — runs on Node.js (fetch is built in, no dependencies needed)
// Env vars required (set in Vercel → Settings → Environment Variables):
//   YOUTUBE_API_KEY   — from Google Cloud Console (YouTube Data API v3)
//   GEMINI_API_KEY    — from Google AI Studio (aistudio.google.com)
//   WEB3FORMS_KEY     — optional, defaults to the key already used on the landing page

const IDEA_COUNT_BY_PLAN = {
  free: 1,
  plan20: 2,
  plan49: 7,
  plan99: 15,
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { channelUrl, plan = "free", email = "" } = req.body || {};

    if (!channelUrl || typeof channelUrl !== "string") {
      res.status(400).json({ error: "Please enter your channel link or @handle." });
      return;
    }

    const YT_KEY = process.env.YOUTUBE_API_KEY;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    if (!YT_KEY || !GEMINI_KEY) {
      res.status(500).json({
        error:
          "Server isn't configured yet. Add YOUTUBE_API_KEY and GEMINI_API_KEY in Vercel Environment Variables.",
      });
      return;
    }

    const channelId = await resolveChannelId(channelUrl, YT_KEY);
    if (!channelId) {
      res.status(404).json({
        error: "Channel not found. Check the link — try the full YouTube channel URL or @handle.",
      });
      return;
    }

    const channelData = await fetchJSON(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${YT_KEY}`
    );
    const channel = channelData.items && channelData.items[0];
    if (!channel) {
      res.status(404).json({ error: "Couldn't fetch channel data." });
      return;
    }

    const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
    const playlistData = await fetchJSON(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=6&playlistId=${uploadsPlaylistId}&key=${YT_KEY}`
    );

    const videoIds = (playlistData.items || [])
      .map((item) => item.snippet && item.snippet.resourceId && item.snippet.resourceId.videoId)
      .filter(Boolean);

    let videos = [];
    if (videoIds.length) {
      const videosData = await fetchJSON(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(",")}&key=${YT_KEY}`
      );
      videos = (videosData.items || []).map((v) => ({
        title: v.snippet.title,
        tags: v.snippet.tags || [],
        views: v.statistics.viewCount || "0",
        likes: v.statistics.likeCount || "0",
        publishedAt: v.snippet.publishedAt,
      }));
    }

    const ideaCount = IDEA_COUNT_BY_PLAN[plan] || 1;
    const ideas = await getIdeasFromGemini(channel, videos, ideaCount, GEMINI_KEY);

    // Fire-and-forget usage log so the owner gets an email for every analysis (free or paid)
    logUsage({ channelTitle: channel.snippet.title, channelUrl, plan, email });

    res.status(200).json({
      channelTitle: channel.snippet.title,
      subscribers: channel.statistics.subscriberCount,
      recentVideoCount: videos.length,
      ideas,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong: " + (err && err.message ? err.message : String(err)) });
  }
};

async function fetchJSON(url) {
  const r = await fetch(url);
  const data = await r.json();
  if (data.error) {
    throw new Error(data.error.message || "YouTube API error");
  }
  return data;
}

async function resolveChannelId(rawInput, key) {
  const input = rawInput.trim();

  let m = input.match(/channel\/(UC[\w-]{10,})/);
  if (m) return m[1];

  // If someone pastes a video link instead of a channel link, resolve the
  // video's channel automatically instead of failing.
  m = input.match(/(?:youtu\.be\/|watch\?v=|shorts\/)([\w-]{11})/);
  if (m) {
    const vr = await fetchJSON(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${m[1]}&key=${key}`
    ).catch(() => null);
    if (vr && vr.items && vr.items[0]) return vr.items[0].snippet.channelId;
  }

  m = input.match(/@([\w.-]+)/);
  if (m) {
    const r = await fetchJSON(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(m[1])}&key=${key}`
    ).catch(() => null);
    if (r && r.items && r.items[0]) return r.items[0].id;
  }

  m = input.match(/user\/([\w.-]+)/);
  if (m) {
    const r = await fetchJSON(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${encodeURIComponent(m[1])}&key=${key}`
    ).catch(() => null);
    if (r && r.items && r.items[0]) return r.items[0].id;
  }

  // Fallback: treat whatever text was given as a search query
  const cleaned = input
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/youtube\.com\//, "")
    .replace(/[/?].*$/, "");
  const r2 = await fetchJSON(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(
      cleaned || input
    )}&key=${key}`
  ).catch(() => null);
  if (r2 && r2.items && r2.items[0]) {
    return r2.items[0].snippet.channelId || (r2.items[0].id && r2.items[0].id.channelId);
  }

  return null;
}

async function getIdeasFromGemini(channel, videos, ideaCount, geminiKey) {
  const videoLines = videos.length
    ? videos
        .map(
          (v) =>
            `- "${v.title}" | views: ${v.views} | likes: ${v.likes} | tags: ${
              v.tags.length ? v.tags.join(", ") : "none"
            }`
        )
        .join("\n")
    : "No recent videos found on this channel yet.";

  const prompt = `You are a YouTube growth strategist. A creator has this channel:

Channel name: ${channel.snippet.title}
Subscribers: ${channel.statistics.subscriberCount}
Total views: ${channel.statistics.viewCount}

Their most recent videos (title, views, likes, tags):
${videoLines}

Based on what has actually performed well (and what topics/formats are missing), suggest exactly ${ideaCount} specific next video ideas for THIS channel. Be concrete and specific to their niche and past titles, not generic advice.

Respond with ONLY a JSON array, no extra text, no markdown code fences, in exactly this shape:
[{"title": "video title idea", "tags": ["tag1","tag2","tag3","tag4","tag5"], "reason": "one sentence on why this should work for this channel"}]`;

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const data = await r.json();

  if (data.error) {
    throw new Error(data.error.message || "Gemini API error");
  }

  let raw =
    (data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text) ||
    "";

  raw = raw
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch (e) {
    return [
      {
        title: "Couldn't understand the AI response",
        tags: [],
        reason: raw.slice(0, 400) || "Please try again.",
      },
    ];
  }
}

function logUsage({ channelTitle, channelUrl, plan, email }) {
  const WEB3FORMS_KEY = process.env.WEB3FORMS_KEY || "a3db4b8a-5f8c-4c78-8bf8-1f48df50b4a8";
  fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_key: WEB3FORMS_KEY,
      subject: `Tube Growth — new usage (${plan})`,
      message: `Channel: ${channelTitle}\nURL entered: ${channelUrl}\nPlan: ${plan}\nUser email: ${
        email || "not provided"
      }\nTime: ${new Date().toISOString()}`,
    }),
  }).catch(() => {});
}
