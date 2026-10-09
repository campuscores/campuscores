import HeroMatrix from './HeroMatrix.jsx';

const athletes = [
  {
    "sport": "football",
    "image": "football-cr7.webp",
    "width": 1024,
    "height": 1536,
    "slot": 0.475,
    "alt": "Cristiano Ronaldo dribbling a football in Portugal's red kit"
  },
  {
    "sport": "basketball",
    "image": "basketball.webp",
    "width": 1254,
    "height": 1254,
    "slot": 0.4462,
    "alt": "Generated Kobe Bryant basketball portrait with the ball raised for a layup"
  },
  {
    "sport": "lawn-tennis",
    "image": "lawn-tennis.webp",
    "width": 1254,
    "height": 1254,
    "slot": 0.422,
    "alt": "Generated Novak Djokovic tennis portrait celebrating with his racket"
  },
  {
    "sport": "badminton",
    "image": "badminton-sindhu.webp",
    "width": 1254,
    "height": 1254,
    "slot": 0.3426,
    "alt": "Generated PV Sindhu badminton portrait reaching toward a shuttlecock"
  },
  {
    "sport": "table-tennis",
    "image": "table-tennis.webp",
    "width": 1254,
    "height": 1254,
    "slot": 0.3314,
    "alt": "Table tennis player making a forehand stroke with a red paddle"
  },
  {
    "sport": "volleyball",
    "image": "volleyball.webp",
    "width": 1254,
    "height": 1254,
    "slot": 0.3542,
    "alt": "Volleyball player preparing a forearm pass toward a blue and yellow ball"
  }
];

export default function Hero() {
  return <>
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}><defs><clipPath id="panel-football" clipPathUnits="objectBoundingBox"><path d="M 0.33331 0.01660 Q 0.33894 0.00000 0.36695 0.00000 L 0.97199 0.00000 Q 1.00000 0.00000 0.99358 0.01650 L 0.61707 0.98350 Q 0.61064 1.00000 0.58263 1.00000 L 0.02801 1.00000 Q 0.00000 1.00000 0.00563 0.98340 Z"/></clipPath><clipPath id="panel-basketball" clipPathUnits="objectBoundingBox"><path d="M 0.23134 0.02835 Q 0.23810 0.00000 0.26450 0.00183 L 0.97360 0.05096 Q 1.00000 0.05279 0.99338 0.08118 L 0.80291 0.89829 Q 0.79630 0.92669 0.76993 0.92911 L 0.02636 0.99757 Q 0.00000 1.00000 0.00675 0.97165 Z"/></clipPath><clipPath id="panel-lawn-tennis" clipPathUnits="objectBoundingBox"><path d="M 0.17697 0.03205 Q 0.18283 0.00000 0.21053 0.00000 L 0.97230 0.00000 Q 1.00000 0.00000 0.99358 0.03189 L 0.82083 0.88942 Q 0.81440 0.92131 0.78680 0.92398 L 0.02761 0.99733 Q 0.00000 1.00000 0.00586 0.96795 Z"/></clipPath><clipPath id="panel-badminton" clipPathUnits="objectBoundingBox"><path d="M 0.24202 0.08972 Q 0.25172 0.05323 0.28614 0.05078 L 0.96559 0.00245 Q 1.00000 0.00000 0.99113 0.03674 L 0.76749 0.96326 Q 0.75862 1.00000 0.72414 1.00000 L 0.03448 1.00000 Q 0.00000 1.00000 0.00970 0.96351 Z"/></clipPath><clipPath id="panel-table-tennis" clipPathUnits="objectBoundingBox"><path d="M 0.23737 0.07829 Q 0.24638 0.04332 0.28255 0.04124 L 0.96383 0.00208 Q 1.00000 0.00000 0.99184 0.03517 L 0.77627 0.96483 Q 0.76812 1.00000 0.73188 1.00000 L 0.03623 1.00000 Q 0.00000 1.00000 0.00901 0.96503 Z"/></clipPath><clipPath id="panel-volleyball" clipPathUnits="objectBoundingBox"><path d="M 0.22985 0.10200 Q 0.23810 0.06977 0.27196 0.06667 L 0.96613 0.00310 Q 1.00000 0.00000 0.99183 0.03225 L 0.75987 0.94782 Q 0.75170 0.98007 0.71770 0.98097 L 0.03400 0.99910 Q 0.00000 1.00000 0.00825 0.96777 Z"/></clipPath></defs></svg>
    <section className="hero" aria-labelledby="hero-title">
      <HeroMatrix />
      <h1 id="hero-title"><span>Live Scores,</span>{' '}<span>Stats &amp; More</span></h1>
      <div className="hero-art"><div className="player-gallery" id="players" role="group" aria-label="Six sports players">
        {athletes.map((athlete, index) => {
          const image = {
            src: `/assets/${athlete.image}`,
            srcSet: `/assets/${athlete.image.replace('.webp', '-320.webp')} 320w, /assets/${athlete.image.replace('.webp', '-640.webp')} 640w, /assets/${athlete.image} ${athlete.width}w`,
            // The slot includes the panel width plus 20cqh; the gallery is 90% of its column.
            sizes: `(max-width: 767px) calc(${athlete.slot * 90}vw - ${athlete.slot * 28.8}px), (max-width: 800px) calc(${athlete.slot * 90}vw - ${athlete.slot * 36}px), (max-width: 1023px) ${athlete.slot * 684}px, (max-width: 1344px) calc(${athlete.slot * 57.6}vw - ${athlete.slot * 89.856}px), ${athlete.slot * 684.288}px`,
            width: athlete.width,
            height: athlete.height,
            decoding: 'async',
          };
          return <figure key={athlete.sport} className={`athlete-card ${athlete.sport}`}>
            <div className="player-core"><img {...image} alt={athlete.alt} fetchPriority={index === 0 ? 'high' : 'auto'} /></div>
            <img {...image} alt="" aria-hidden="true" className="player-popout" />
          </figure>;
        })}
      </div></div>
    </section>
  </>;
}
