export const runtime = "nodejs";

import crypto from "crypto";
import mongoose from "mongoose";

const API_KEY = (process.env.LASTFM_API_KEY || "").trim();
const API_SECRET = (process.env.LASTFM_API_SECRET || "").trim();
const MONGO_URI = (process.env.MONGO_URI || "").trim();
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();

const stateSchema = new mongoose.Schema({
  stateId: { type: String, required: true, unique: true },
  discordId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 },
});
const lfmSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  sessionKey: { type: String },
});

let _conn = null;
async function getConn() {
  if (_conn && _conn.readyState === 1) return _conn;
  _conn = await mongoose
    .createConnection(MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    .asPromise();
  return _conn;
}

function sign(params) {
  const str =
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("") + API_SECRET;
  return crypto.createHash("md5").update(str, "utf8").digest("hex");
}

async function sendDM(discordId, username, scrobbles) {
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
            color: 0xb90000,
            author: {
              name: "Last.fm Connected",
              icon_url: "https://www.last.fm/static/images/lastfm_avatar_twitter.png",
            },
            description: [
              `✅ Your Last.fm account **${username}** has been linked to Contoured.`,
              "",
              `**Scrobbles:** ${scrobbles.toLocaleString()}`,
              "",
              "You can now use `,np` to show what you're listening to.",
            ].join("\n"),
            footer: { text: "Plead · last.fm" },
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
      <h1 className={success ? "heading-success" : "heading-error"}>{heading}</h1>
      <p dangerouslySetInnerHTML={{ __html: body }} />
      {showTag && <div className="tag">✓ last.fm connected</div>}
      <p className="footer">Plead · last.fm integration</p>
    </div>
  );
}

export default async function CallbackPage({ searchParams }) {
  const { token, state } = await searchParams;

  if (!token || !state) {
    return (
      <Card
        icon="❌"
        success={false}
        heading="Invalid Request"
        body="Missing token or state. Try linking again from Discord."
      />
    );
  }

  if (!API_KEY || !API_SECRET) {
    return (
      <Card
        icon="❌"
        success={false}
        heading="Not Configured"
        body="Set <strong>LASTFM_API_KEY</strong> and <strong>LASTFM_API_SECRET</strong> in your Vercel environment variables."
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
    const c = await getConn();
    const State = c.models.LastFMState || c.model("LastFMState", stateSchema);
    const LastFM = c.models.LastFM || c.model("LastFM", lfmSchema);

    const stateDoc = await State.findOne({ stateId: state });
    if (!stateDoc) {
      return (
        <Card
          icon="⏰"
          success={false}
          heading="Link Expired"
          body="This link has expired or already been used.<br/>Use <strong>,lf set</strong> in Discord to get a new one."
        />
      );
    }

    const params = { api_key: API_KEY, method: "auth.getSession", token };
    const api_sig = sign(params);

    const lfRes = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=auth.getSession&api_key=${encodeURIComponent(API_KEY)}&token=${encodeURIComponent(token)}&api_sig=${encodeURIComponent(api_sig)}&format=json`
    ).then((r) => r.json());

    if (lfRes.error) {
      return (
        <Card
          icon="❌"
          success={false}
          heading="Authentication Failed"
          body={`${lfRes.message || "Last.fm rejected the token."} (error ${lfRes.error})`}
        />
      );
    }

    const { name: username, key: sessionKey } = lfRes.session;
    const discordId = stateDoc.discordId;

    let scrobbles = 0;
    try {
      const info = await fetch(
        `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${encodeURIComponent(username)}&api_key=${encodeURIComponent(API_KEY)}&format=json`
      ).then((r) => r.json());
      scrobbles = parseInt(info.user?.playcount || "0");
    } catch {}

    await LastFM.findOneAndUpdate(
      { userId: discordId },
      { userId: discordId, username, sessionKey },
      { upsert: true, new: true }
    );
    await State.deleteOne({ stateId: state });

    sendDM(discordId, username, scrobbles).catch(() => {});

    return (
      <Card
        icon="🎵"
        success={true}
        heading={`Welcome, ${username}!`}
        body="Your Last.fm account has been linked.<br/>Check your Discord DMs — Plead has sent you a confirmation.<br/><br/>You can close this tab."
        showTag={true}
      />
    );
  } catch (err) {
    return (
      <Card
        icon="❌"
        success={false}
        heading="Something went wrong"
        body={err.message || "Unknown error. Please try again."}
      />
    );
  }
}
