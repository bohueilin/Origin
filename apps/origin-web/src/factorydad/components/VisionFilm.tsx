// Ambient "physical AI is here" beat — the visceral stakes that make permission
// matter. Muted, autoplaying, looping; decorative, so the heading + caption carry
// the meaning for screen readers.

export function VisionFilm() {
  return (
    <section className="fd-section fd-shell" id="film">
      <div className="fd-kicker">Physical AI is here</div>
      <h2>It's already moving in next to people.</h2>
      <p className="fd-section-sub">
        Factories, hospitals, homes. The robot is arriving — the only question left is whether you
        can trust it on your floor.
      </p>

      <figure className="fd-film">
        <video
          src="/Home_Collaboration_Videos.mp4"
          poster="/home-collaboration-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          controls={false}
          aria-hidden="true"
        />
        <span className="fd-film-scrim" aria-hidden="true" />
        <figcaption className="fd-film-cap">
          Working alongside people — the moment trust is earned, or lost.
        </figcaption>
      </figure>
    </section>
  )
}
