export const runtime = "nodejs";

import mongoose from "mongoose";

const CLIENT_ID = (process.env.SPOTIFY_CLIENT_ID || "").trim();
const CLIENT_SECRET = (process.env.SPOTIFY_CLIENT_SECRET || "").trim();
const MONGO_URI = (process.env.MONGO_URI || "").trim();
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const REDIRECT_URI = "https://contoured.vercel.app/spotify/callback";

const SPO_ICON =
  "https://storage.googleapis.com/pr-newsroom-wp/1/2018/11/Spotify_Icon_RGB_Green.png";
const SPO_GREEN = "#1db954";

const spotifyAuthSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  accessToken: String,
  refreshToken: String,
  expiresAt: Number,
});

let _conn = null;
async function getConn() {
  if (_conn && _conn.readyState === 1) return _conn;
  _conn = await mongoose
    .createConnection(MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    .asPromise();
  return _conn;
}

async function sendDM(discordId, spotifyUsername) {
  if (!DISCORD_TOKEN) return;
  try {
    const dm = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: discordId }),
    }).then((r) => r.json());

    await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [
          {
            color: 0x1db954,
            author: {
              name: "Spotify Connected",
              icon_url: SPO_ICON,
            },
            description: [
              `✅ Your Spotify account **${spotifyUsername}** has been linked.`,
              "",
              "You can now use `,spotify` commands to control playback.",
            ].join("\n"),
            footer: { text: "Contoured · spotify" },
          },
        ],
      }),
    });
  } catch {}
}

function Card({ success, icon, heading, body, showTag }) {
  return (
    <div className="card">
      <span className="icon">{icon}</span>
      <h1
        className={success ? "heading-success" : "heading-error"}
        style={success ? { color: SPO_GREEN } : {}}
      >
        {heading}
      </h1>
      <p dangerouslySetInnerHTML={{ __html: body }} />
      {showTag && (
        <div className="tag" style={{ background: SPO_GREEN }}>
          ✓ spotify connected
        </div>
      )}
      <p className="footer">Contoured · spotify integration</p>
    </div>
  );
}

export default async function SpotifyCallbackPage({ searchParams }) {
  const params = await searchParams;
  const code = params.code;
  const state = params.state;
  const error = params.error;

  if (error || !code || !state) {
    return (
      <Card
        icon="❌"
        success={false}
        heading="Authorization Failed"
        body="Spotify authorization was denied or failed.<br/>Use <strong>,spotify login</strong> in Discord to try again."
      />
    );
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return (
      <Card
        icon="❌"
        success={false}
        heading="Not Configured"
        body="Set <strong>SPOTIFY_CLIENT_ID</strong> and <strong>SPOTIFY_CLIENT_SECRET</strong> in your Vercel environment variables."
      />
    );
  }

  if (!MONGO_URI) {
    return (
      <Card
        icon="❌"
        success={false}
        heading="Not Configured"
        body="Set <strong>MONGO_URI</strong> in your Vercel environment variables."
      />
    );
  }

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${CLIENT_ID}:${CLIENT_SECRET}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenText = await tokenRes.text();
    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      return (
        <Card
          icon="❌"
          success={false}
          heading="Token Exchange Failed"
          body="Spotify returned an unexpected response. Please try again with <strong>,spotify login</strong>."
        />
      );
    }

    if (!tokenRes.ok || !tokenData.access_token) {
      return (
        <Card
          icon="❌"
          success={false}
          heading="Token Exchange Failed"
          body={`Spotify error: ${tokenData.error_description || tokenData.error || "Unknown"}`}
        />
      );
    }

    let spotifyUsername = "your account";
    try {
      const profileRes = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (profileRes.ok) {
        const profileText = await profileRes.text();
        const profile = JSON.parse(profileText);
        spotifyUsername = profile.display_name || profile.id || "your account";
      }
    } catch {}

    const c = await getConn();
    const SpotifyAuth =
      c.models.SpotifyAuth || c.model("SpotifyAuth", spotifyAuthSchema);

    await SpotifyAuth.findOneAndUpdate(
      { userId: state },
      {
        userId: state,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
      },
      { upsert: true, new: true }
    );

    sendDM(state, spotifyUsername).catch(() => {});

    return (
      <Card
        icon="🎵"
        success={true}
        heading={`Welcome, ${spotifyUsername}!`}
        body="Your Spotify account has been linked.<br/>Check your Discord DMs — Contoured has sent you a confirmation.<br/><br/>You can close this tab."
        showTag={true}
      />
    );
  } catch (err) {
    return (
      <Card
        icon="❌"
        success={false}
        heading="Something went wrong"
        body={String(err?.message || err).replace(/[<>]/g, "") || "Unknown error. Please try again."}
      />
    );
  }
}
