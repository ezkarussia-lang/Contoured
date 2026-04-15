export default function Home() {
  return (
    <div className="card">
      <span className="icon">🎵</span>
      <h1 className="heading-success">Contoured · Last.fm</h1>
      <p>This is the Last.fm OAuth callback server for the Plead Discord bot.</p>
      <p style={{ marginTop: "12px" }}>
        Use <strong>,lf set</strong> in Discord to connect your Last.fm account.
      </p>
      <p className="footer">Plead · last.fm integration</p>
    </div>
  );
}
