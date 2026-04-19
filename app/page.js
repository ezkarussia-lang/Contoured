export default function Home() {
  return (
    <div className="card">
      <span className="icon">🎵</span>
      <h1 className="heading-success">Contoured</h1>
      <p>OAuth callback server for the Contoured Discord bot.</p>
      <p style={{ marginTop: "12px" }}>
        Use <strong>,lf set</strong> to connect Last.fm.<br />
        Use <strong>,spotify login</strong> to connect Spotify.
      </p>
      <p className="footer">Contoured · last.fm &amp; spotify</p>
    </div>
  );
}
