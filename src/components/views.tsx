import type { FactResult, UserView } from '@/lib/contracts'
import { Shell } from './shell'
import { AuthForm } from './auth-form'
import type { AuthAction } from './auth-form'
import { MovieForm } from './movie-form'
import type { MovieAction } from './movie-form'
import { Avatar } from './avatar'

// FR-01, NFR-07: Provide the public sign-in view.
export function LandingView({
  loginAction,
  loginFailed,
}: {
  readonly loginAction: AuthAction
  readonly loginFailed: boolean
}) {
  return (
    <Shell>
      <section className="landing">
        <div className="landing-copy">
          <p className="eyebrow">
            <span className="little-star" aria-hidden="true">✦</span> For the love of the rewatch</p>
          <h1>Some films<br />feel like <em>home.</em>
          </h1>
          <p className="intro">The one you know by heart. The one you always come back to. Give your favorite film a little place of its own.</p>
          {loginFailed && <p className="error-message" role="alert">Sign-in was canceled or could not be completed. Please try again.</p>}
          <div className="action-area">
            <AuthForm action={loginAction} mode="login" />
          </div>
          <p className="signin-note">Just you, your favorite movie, and a little discovery.</p>
        </div>
        <div className="cinema-scene" aria-hidden="true">
          <div className="scene-photo" />
          <div className="scene-topline">
            <span>THE MOVIE MEMORY PICTURE HOUSE</span>
            <span>EST. FOR YOU</span>
          </div>
          <div className="scene-caption">
            <span>Take a seat.<br />Stay a little.</span>
            <span className="scene-asterisk">✳</span>
          </div>
          <div className="keepsake-ticket">
            <div>
              <span className="ticket-label">A TICKET TO YOUR HAPPY PLACE</span>
              <strong>One film.<br />All yours.</strong>
              <span className="ticket-small">Keep the feeling. Discover the story.</span>
            </div>
            <div className="ticket-stub">
              <span>ADMIT ONE</span>
              <span className="ticket-barcode" />
              <span>MM / 001</span>
            </div>
          </div>
        </div>
      </section>
      <section className="landing-note" aria-label="The idea behind Movie Memory">
        <span className="note-number">01 / THE IDEA</span>
        <p>Not every movie needs a rating.<br />
          <strong>Some just need a place in your heart.</strong>
        </p>
        <span className="note-tail">Save a favorite.<br /> Find a little more to love.</span>
      </section>
    </Shell>
  )
}

// FR-03, FR-05, NFR-06: Present the first-time movie form and its states.
export function OnboardingView({
  saveAction,
  logoutAction,
}: {
  readonly saveAction: MovieAction
  readonly logoutAction: AuthAction
}) {
  return (
    <Shell actions={<AuthForm action={logoutAction} mode="logout" />}>
      <section className="onboarding-layout">
        <div className="form-page">
          <p className="eyebrow">
            <span className="little-star" aria-hidden="true">✦</span> Let&apos;s make this your place</p>
          <h1>What&apos;s your favorite movie?</h1>
          <p className="intro">The one you keep coming back to. Save it once, and we&apos;ll find a fact about it for you.</p>
          <MovieForm action={saveAction} />
          <p className="onboarding-note">No right answer. Just the one that feels like you.</p>
        </div>
        <aside className="onboarding-art" aria-hidden="true">
          <span className="eyebrow">YOUR PERSONAL PICTURE HOUSE</span>
          <div className="art-orbit">
            <span>That<br />
              <em>one</em>
              <br />film.</span>
          </div>
          <p>The credits roll.<br />The feeling stays.</p>
          <span className="art-bottom">A MOVIE MEMORY ORIGINAL <span>✦</span>
          </span>
        </aside>
      </section>
    </Shell>
  )
}

// FR-06, FR-10: Render private profile, movie, and fact results supplied by the server.
export function DashboardView({
  user,
  fact,
  logoutAction,
}: {
  readonly user: UserView & { readonly favoriteMovie: string }
  readonly fact: Extract<FactResult, { kind: 'fact' }> | Extract<FactResult, { kind: 'error' }> & { readonly code: 'UNAVAILABLE' }
  readonly logoutAction: AuthAction
}) {
  return (
    <Shell actions={<AuthForm action={logoutAction} mode="logout" />}>
      <div className="dashboard">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">YOUR PERSONAL PICTURE HOUSE</p>
            <p className="welcome">Welcome back{user.name?.trim() ? `, ${user.name.trim().split(/\s+/)[0]}` : ''}<span className="welcome-dot">.</span>
            </p>
          </div>
          <span className="private-note">
            <span aria-hidden="true">●</span> A little space, just for you</span>
        </div>
        <section className="favorite-feature" id="favorite" aria-label="Your saved movie">
          <div className="favorite-copy">
            <p className="movie-label">
              <span aria-hidden="true">✦</span> Your favorite movie</p>
            <h1 className="movie-title">{user.favoriteMovie}</h1>
            <p className="favorite-description">Some stories become a part of yours.<br />This one has a home here.</p>
            <span className="saved-label">
              <span aria-hidden="true">✓</span> Saved to your memory</span>
          </div>
          <div className="favorite-art" aria-hidden="true">
            <span className="art-inscription">THE FILMS WE KEEP</span>
            <div className="film-orbit">
              <span>✳</span>
            </div>
            <div className="feature-ticket">
              <span>YOUR FOREVER FAVORITE</span>
              <strong>Admit one.</strong>
              <div className="feature-ticket-bottom">
                <span>SEAT<br />
                  <b>YOURS</b>
                </span>
                <span className="ticket-barcode" />
                <span>SHOW<br />
                  <b>ALWAYS</b>
                </span>
              </div>
            </div>
          </div>
        </section>
        <div className="dashboard-bottom">
          <section className="fact-section" aria-labelledby="fact-heading">
            <div className="fact-heading-row">
              <span className="fact-symbol" aria-hidden="true">✦</span>
              <span className="eyebrow">THERE&apos;S ALWAYS A LITTLE MORE TO THE STORY</span>
            </div>
            <h2 id="fact-heading">A little behind the scenes.</h2>
            <FactContent fact={fact} />
            <p className="metadata">AI-generated and unverified. Movie facts may contain inaccuracies.</p>
          </section>
          <section className="profile-panel" aria-label="Your profile">
            <p className="eyebrow">THE PERSON IN THE FRONT ROW</p>
            <div className="profile">
              <Avatar name={user.name} image={user.image} />
              <div>
                <p className="profile-name">{user.name?.trim() || 'Movie lover'}</p>
                <p className="metadata">{user.email?.trim() || 'Email not available'}</p>
              </div>
            </div>
            <div className="profile-note">
              <span aria-hidden="true">✳</span>
              <p>A familiar film.<br />A fresh little discovery.<br />
                <strong>Make yourself at home.</strong>
              </p>
            </div>
          </section>
        </div>
      </div>
    </Shell>
  )
}

// FR-10, NFR-06: Keep stale and unavailable results distinct from fresh facts.
function FactContent({ fact }: { readonly fact: Parameters<typeof DashboardView>[0]['fact'] }) {
  switch (fact.kind) {
    case 'fact':
      return <>
        <p className="fact-text">{fact.text}</p>
        {fact.stale && <p className="status-message" role="status">A new fact couldn&apos;t be retrieved. Here&apos;s your last saved fact.</p>}
      </>
    case 'error':
      return <p className="status-message" role="status">A fact isn&apos;t available right now. Please try visiting again later.</p>
    default:
      return assertNever(fact)
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected fact result: ${String(value)}`)
}
