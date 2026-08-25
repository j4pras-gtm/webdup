'use strict';

/**
 * B05-pages / B07-assemble for job-001 (source: monthlystaff.com).
 * Generates an ORIGINAL static rebrand ("Teamloop") that mirrors the source
 * site's structure and design language, with 100% original copy and
 * fictional placeholder profiles. No logos, copy, imagery, or legal text
 * from the source are reused.
 *
 * Output: exports/teamloop/{index.html, css/styles.css, js/main.js}
 */

const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..', '..', 'exports', 'teamloop');

// ---------------------------------------------------------------------------
// Data (all fictional)
// ---------------------------------------------------------------------------

const TRENDING = ['React', 'Node.js', 'AI', 'Design', 'Marketing'];

const CATEGORIES = ['All talent', 'Development', 'AI & data', 'Design', 'Marketing', 'Business'];

const TALENT = [
  { name: 'Ava Chen', role: 'Frontend Engineer', exp: '4+ yrs', place: 'Toronto, Canada', skills: ['React', 'TypeScript', 'Next.js'], price: 900 },
  { name: 'Liam Osei', role: 'DevOps Engineer', exp: '6+ yrs', place: 'Accra, Ghana', skills: ['AWS', 'Kubernetes', 'Terraform'], price: 1100 },
  { name: 'Sofia Marino', role: 'Product Designer', exp: '5+ yrs', place: 'Milan, Italy', skills: ['Figma', 'Prototyping', 'Design systems'], price: 800 },
  { name: 'Noah Patel', role: 'Data Analyst', exp: '3+ yrs', place: 'Mumbai, India', skills: ['SQL', 'Power BI', 'Python'], price: 500 },
  { name: 'Emma Novak', role: 'Content Strategist', exp: '7+ yrs', place: 'Prague, Czechia', skills: ['SEO', 'Copywriting', 'Editorial'], price: 650 },
  { name: 'Diego Fuentes', role: 'Backend Developer', exp: '8+ yrs', place: 'Mexico City, Mexico', skills: ['Node.js', 'PostgreSQL', 'Redis'], price: 1200 },
  { name: 'Yara Haddad', role: 'AI Engineer', exp: '2+ yrs', place: 'Dubai, UAE', skills: ['LLMs', 'RAG', 'Python'], price: 1500 },
  { name: 'Tom Becker', role: 'QA Engineer', exp: '5+ yrs', place: 'Berlin, Germany', skills: ['Playwright', 'Cypress', 'API testing'], price: 700 },
];

const BENEFITS = [
  { icon: 'shield', title: 'Vetted profiles', body: 'Every profile shows real skills, experience, and portfolio context before you reach out.' },
  { icon: 'zap', title: 'Start this week', body: 'Skip long recruiting cycles and talk to available specialists today.' },
  { icon: 'users', title: 'Stay consistent', body: 'Work with the same person month after month, not a stranger every sprint.' },
  { icon: 'globe', title: 'Hire anywhere', body: 'Build the right team without being limited by where you sit.' },
];

const STEPS = [
  { n: '01', title: 'Find your match', body: 'Search by skill, experience, location, and monthly budget.' },
  { n: '02', title: 'Meet the person', body: 'Review their work, chat directly, and make sure the fit feels right.' },
  { n: '03', title: 'Start working', body: 'Agree on a monthly scope and bring them into your team. No long contract.' },
];

const GUIDES = [
  'Hire remote developers', 'Hire React developers', 'Hire WordPress developers',
  'Hire graphic designers', 'Hire UI/UX designers', 'Hire video editors',
  'Hire digital marketers', 'Hire SEO specialists', 'Hire social media managers',
  'Hire content writers', 'Hire customer support', 'Hire data entry specialists',
  'Hire virtual assistants', 'Hire project managers', 'Remote staffing guide',
];

// ---------------------------------------------------------------------------
// Icons (original simple line SVGs)
// ---------------------------------------------------------------------------

const ICONS = {
  arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-6 11-8 11s-8-6-8-11a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  briefcase: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="6" rx="2"/><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
  shield: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>',
  zap: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/></svg>',
  users: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  globe: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/></svg>',
  building: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01M12 6h.01M12 10h.01M12 14h.01"/></svg>',
};

// ---------------------------------------------------------------------------
// HTML fragments
// ---------------------------------------------------------------------------

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function talentCard(t) {
  return `
      <article class="profile-card">
        <div class="profile-image-wrap">
          <div class="profile-avatar" aria-hidden="true">${initials(t.name)}</div>
          <span class="online-badge"><i></i> Available</span>
        </div>
        <div class="profile-body">
          <div class="profile-topline">
            <div><h3>${t.name}</h3><p>${t.role}</p></div>
            <div class="experience-label">${ICONS.briefcase} ${t.exp}</div>
          </div>
          <div class="location">${ICONS.pin}<span>${t.place}</span></div>
          <div class="skills">${t.skills.map(s => `<span>${s}</span>`).join('')}</div>
          <div class="profile-footer">
            <div class="price"><small>From</small><strong>$${t.price.toLocaleString()}</strong><span>/month</span></div>
            <a class="card-view-link" href="#talent"><span>View</span>${ICONS.arrow}</a>
          </div>
        </div>
      </article>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Hire Remote Talent by the Month | Teamloop</title>
<meta name="description" content="Find developers, designers, marketers, and assistants for ongoing monthly work. Compare public profiles and contact specialists directly."/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="css/styles.css"/>
</head>
<body>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="Teamloop home">team<span>loop</span><b>.</b></a>
    <nav class="main-nav" aria-label="Primary">
      <a href="#talent">Find talent</a>
      <a href="#how">How it works</a>
      <a href="#why">Why choose us</a>
      <a href="#vacancies">Job seekers</a>
      <a href="#faq">FAQ</a>
    </nav>
    <div class="header-actions">
      <a class="btn btn-outline" href="#talent">List your talent</a>
      <a class="btn btn-primary" href="#talent">Join as talent</a>
    </div>
    <button class="menu-toggle" aria-label="Toggle menu" aria-expanded="false">&#9776;</button>
  </div>
</header>

<main>
<section class="hero">
  <div class="container">
    <p class="hero-kicker">Monthly talent marketplace</p>
    <h1>Hire <em>by the month</em>,<br/>from $300/month</h1>
    <p class="hero-sub">Connect directly with global specialists for ongoing work. Clear monthly pricing, no platform fees, no lengthy recruitment.</p>
    <form class="search-bar" role="search" onsubmit="return false;">
      ${ICONS.search}
      <input type="text" placeholder="Search skills, roles, or tools" aria-label="Search talent"/>
      <button type="submit" class="btn btn-primary">Search</button>
    </form>
    <p class="popular">Popular: ${TRENDING.map(t => `<a href="#talent">${t}</a>`).join(' ')}</p>
    <ul class="hero-stats">
      <li><strong>Zero</strong> platform fees</li>
      <li><strong>Flexible</strong> monthly hiring</li>
      <li><strong>272</strong> active profiles</li>
    </ul>
  </div>
</section>

<section class="dual-cards">
  <div class="container dual-grid">
    <div class="dual-card">
      <span class="kicker">For talent</span>
      <h3>List your services</h3>
      <p>Create a public profile in minutes and get discovered by teams hiring monthly.</p>
      <a class="btn btn-primary" href="#talent">Create profile ${ICONS.arrow}</a>
    </div>
    <div class="dual-card">
      <span class="kicker">Explore</span>
      <h3>Browse vetted talent</h3>
      <p>Compare skills, rates, and experience. Contact anyone directly from their public profile.</p>
      <a class="btn btn-outline" href="#talent">Browse talent ${ICONS.arrow}</a>
    </div>
  </div>
</section>

<section class="talent-section section" id="talent">
  <div class="container">
    <div class="section-heading">
      <div>
        <span class="section-kicker">Recommended talent</span>
        <h2>Specialists ready for monthly collaboration</h2>
      </div>
      <p><strong>272</strong> available specialists</p>
    </div>
    <div class="filters" role="tablist" aria-label="Filter talent by category">
      ${CATEGORIES.map((c, i) => `<button class="filter-chip${i === 0 ? ' active' : ''}" role="tab" aria-selected="${i === 0}">${c}</button>`).join('')}
    </div>
    <div class="profile-grid">
${TALENT.map(talentCard).join('\n')}
    </div>
    <div class="load-more"><button class="btn btn-outline">Load more talent</button></div>
  </div>
</section>

<section class="vacancies-section" id="vacancies">
  <div class="container">
    <div class="vacancies-heading">
      <div>
        <span class="section-kicker">Another way to connect</span>
        <h2>Open monthly opportunities</h2>
        <p>Companies can announce transparent roles with clear monthly pay and expected contract length.</p>
      </div>
      <a class="btn btn-outline" href="#vacancies">Browse vacancies ${ICONS.arrow}</a>
    </div>
    <div class="vacancies-banner">
      ${ICONS.building}
      <div><strong>Looking to hire?</strong><span>Publishing a vacancy is a simple way to reach registered talent.</span></div>
      <a class="btn btn-primary" href="#vacancies">Announce a vacancy ${ICONS.arrow}</a>
    </div>
  </div>
</section>

<section class="how-section section" id="how">
  <div class="container">
    <div class="section-heading centered">
      <span class="section-kicker">Simple by design</span>
      <h2>From shortlist to teammate in three steps</h2>
    </div>
    <div class="steps-grid">
      ${STEPS.map(s => `<div class="step"><span>${s.n}</span><h3>${s.title}</h3><p>${s.body}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="why-section" id="why">
  <div class="container why-grid">
    <div>
      <span class="section-kicker light">A better way to build</span>
      <h2>Freelance flexibility.<br/>Real team commitment.</h2>
      <p class="why-intro">Teamloop is made for work that matters beyond a single task.</p>
      <a class="btn btn-light" href="#talent">Explore talent ${ICONS.arrow}</a>
    </div>
    <div class="benefit-grid">
      ${BENEFITS.map(b => `<div class="benefit">${ICONS[b.icon]}<h3>${b.title}</h3><p>${b.body}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="cta-section section">
  <div class="container cta-card">
    <div>
      <span class="section-kicker light">Ready when you are</span>
      <h2>Build your dream team,<br/>one month at a time.</h2>
    </div>
    <a class="btn btn-light" href="#talent">Find your person ${ICONS.arrow}</a>
  </div>
</section>
</main>

<footer id="faq">
  <div class="container footer-grid">
    <div>
      <a class="brand" href="/" aria-label="Teamloop home">team<span>loop</span><b>.</b></a>
      <p>Specialists who stay, month after month.</p>
    </div>
    <div>
      <h4>For businesses</h4>
      <a href="#talent">Find talent</a>
      <a href="#vacancies">Announce a vacancy</a>
      <a href="#how">How it works</a>
      <a href="#why">Why choose us</a>
    </div>
    <div>
      <h4>For talent</h4>
      <a href="#why">Why join</a>
      <a href="#vacancies">Browse vacancies</a>
      <a href="#talent">Create your profile</a>
    </div>
    <div>
      <h4>Company</h4>
      <a href="#">Our promise</a>
      <a href="#faq">FAQ</a>
      <a href="#">Contact</a>
    </div>
  </div>
  <div class="container footer-guides">
    <div class="footer-guides-heading">
      <span class="section-kicker">Teamloop resources</span>
      <h3>Practical hiring guides</h3>
      <p>Clear guidance for finding, evaluating, and working with remote specialists.</p>
    </div>
    <nav aria-label="Hiring guides">
      ${GUIDES.map(g => `<a href="#">${g}</a>`).join('\n      ')}
    </nav>
  </div>
  <div class="container footer-bottom">
    <span>&copy; 2026 Teamloop</span>
    <span>Made for better work, everywhere.</span>
  </div>
</footer>

<script src="js/main.js"></script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// CSS — original stylesheet mirroring the source's design language
// (green primary, ink text, cream sections, Inter, rounded cards)
// ---------------------------------------------------------------------------

const css = `:root{
  --green:#1dbf73; --green-dark:#0d6f46; --green-deep:#087850;
  --ink:#222325; --muted:#62646a; --line:#e4e5e7; --cream:#f7f7f2;
  --tint:#eaf8f1; --tint-line:#dfe3e1;
  --radius:14px; --shadow:0 1px 2px rgba(34,35,37,.05),0 8px 24px rgba(34,35,37,.06);
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#fff;line-height:1.55;-webkit-font-smoothing:antialiased}
img{max-width:100%}
a{color:inherit;text-decoration:none}
.container{max-width:1160px;margin:0 auto;padding:0 24px}
.section{padding:88px 0}
h1,h2,h3{line-height:1.15;letter-spacing:-.02em;font-weight:700}
h1{font-size:clamp(2.4rem,5vw,3.6rem);font-weight:800}
h2{font-size:clamp(1.7rem,3.2vw,2.4rem)}
h3{font-size:1.05rem}
.section-kicker{display:inline-block;font-size:.8rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--green-deep);margin-bottom:12px}
.section-kicker.light{color:var(--green)}
.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:36px}
.section-heading.centered{flex-direction:column;align-items:center;text-align:center}

/* buttons */
.btn{display:inline-flex;align-items:center;gap:8px;font:inherit;font-weight:600;font-size:.95rem;padding:11px 20px;border-radius:999px;border:1px solid transparent;cursor:pointer;transition:.15s}
.btn svg{transition:transform .15s}
.btn:hover svg{transform:translateX(3px)}
.btn-primary{background:var(--green);color:#fff}
.btn-primary:hover{background:var(--green-deep)}
.btn-outline{border-color:var(--line);color:var(--ink);background:#fff}
.btn-outline:hover{border-color:var(--ink)}
.btn-light{background:#fff;color:var(--ink)}
.btn-light:hover{background:var(--tint)}

/* header */
.site-header{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.header-inner{display:flex;align-items:center;gap:32px;height:68px}
.brand{font-size:1.35rem;font-weight:800;letter-spacing:-.03em}
.brand span{color:var(--green-deep)}
.brand b{color:var(--green)}
.main-nav{display:flex;gap:26px;margin-left:8px}
.main-nav a{font-size:.92rem;font-weight:500;color:var(--muted)}
.main-nav a:hover{color:var(--ink)}
.header-actions{margin-left:auto;display:flex;gap:10px}
.menu-toggle{display:none;background:none;border:0;font-size:1.4rem;cursor:pointer;color:var(--ink)}

/* hero */
.hero{padding:84px 0 64px;background:linear-gradient(180deg,var(--tint) 0%,#fff 100%)}
.hero-kicker{font-size:.8rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--green-deep);margin-bottom:16px}
.hero h1 em{font-style:normal;color:var(--green-deep)}
.hero-sub{max-width:560px;color:var(--muted);font-size:1.1rem;margin:18px 0 30px}
.search-bar{display:flex;align-items:center;gap:12px;max-width:640px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:8px 8px 8px 20px;box-shadow:var(--shadow)}
.search-bar input{flex:1;border:0;outline:0;font:inherit;font-size:1rem;background:transparent;color:var(--ink)}
.popular{margin-top:14px;font-size:.88rem;color:var(--muted)}
.popular a{color:var(--green-deep);font-weight:500;margin-right:10px}
.popular a:hover{text-decoration:underline}
.hero-stats{display:flex;gap:32px;list-style:none;margin-top:34px;flex-wrap:wrap}
.hero-stats li{font-size:.92rem;color:var(--muted)}
.hero-stats strong{color:var(--ink);font-size:1.05rem}

/* dual cards */
.dual-cards{padding:0 0 24px}
.dual-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.dual-card{border:1px solid var(--line);border-radius:var(--radius);padding:30px;background:#fff;box-shadow:var(--shadow)}
.dual-card .kicker{font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--green-deep)}
.dual-card h3{font-size:1.3rem;margin:10px 0 8px}
.dual-card p{color:var(--muted);font-size:.95rem;margin-bottom:20px}

/* talent */
.talent-section{background:var(--cream)}
.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}
.filter-chip{font:inherit;font-size:.9rem;font-weight:500;padding:8px 18px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--muted);cursor:pointer;transition:.15s}
.filter-chip:hover{border-color:var(--ink);color:var(--ink)}
.filter-chip.active{background:var(--ink);border-color:var(--ink);color:#fff}
.profile-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:18px}
.profile-card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:20px;display:flex;flex-direction:column;gap:14px;transition:.15s}
.profile-card:hover{box-shadow:var(--shadow);transform:translateY(-2px)}
.profile-image-wrap{position:relative;width:64px;height:64px}
.profile-avatar{width:64px;height:64px;border-radius:50%;background:var(--tint);color:var(--green-dark);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.15rem;border:1px solid var(--tint-line)}
.online-badge{position:absolute;bottom:-4px;left:-6px;background:#fff;border:1px solid var(--line);border-radius:999px;font-size:.68rem;font-weight:600;padding:2px 8px;display:inline-flex;align-items:center;gap:5px}
.online-badge i{width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block}
.profile-body{display:flex;flex-direction:column;gap:10px;flex:1}
.profile-topline{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.profile-topline p{color:var(--muted);font-size:.88rem}
.experience-label{display:inline-flex;align-items:center;gap:5px;font-size:.8rem;color:var(--muted);white-space:nowrap}
.location{display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)}
.skills{display:flex;flex-wrap:wrap;gap:6px}
.skills span{font-size:.75rem;font-weight:500;background:var(--cream);border:1px solid var(--line);border-radius:999px;padding:3px 10px;color:var(--ink)}
.profile-footer{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:12px;border-top:1px solid var(--line)}
.price small{display:block;font-size:.7rem;color:var(--muted)}
.price strong{font-size:1.15rem}
.price span{font-size:.8rem;color:var(--muted)}
.card-view-link{display:inline-flex;align-items:center;gap:6px;font-size:.88rem;font-weight:600;color:var(--green-deep)}
.card-view-link:hover{color:var(--green-dark)}
.load-more{display:flex;justify-content:center;margin-top:36px}

/* vacancies */
.vacancies-section{padding:72px 0}
.vacancies-heading{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:28px}
.vacancies-heading p{color:var(--muted);max-width:520px;margin-top:8px}
.vacancies-banner{display:flex;align-items:center;gap:18px;background:var(--tint);border:1px solid var(--tint-line);border-radius:var(--radius);padding:22px 26px}
.vacancies-banner>svg{flex-shrink:0;color:var(--green-deep)}
.vacancies-banner div{flex:1}
.vacancies-banner strong{display:block;font-size:1rem}
.vacancies-banner span{color:var(--muted);font-size:.92rem}

/* how */
.how-section{background:var(--cream)}
.steps-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.step{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:30px}
.step>span{font-size:2rem;font-weight:800;color:var(--green);display:block;margin-bottom:14px}
.step h3{margin-bottom:8px}
.step p{color:var(--muted);font-size:.95rem}

/* why */
.why-section{background:var(--ink);color:#fff;padding:96px 0}
.why-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:56px;align-items:center}
.why-section h2{color:#fff}
.why-intro{color:#b5b6ba;margin:16px 0 28px;font-size:1.05rem}
.benefit-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.benefit{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius);padding:24px}
.benefit svg{color:var(--green);margin-bottom:14px}
.benefit h3{color:#fff;margin-bottom:6px}
.benefit p{color:#b5b6ba;font-size:.9rem}

/* cta */
.cta-section{padding:88px 0}
.cta-card{display:flex;align-items:center;justify-content:space-between;gap:32px;background:linear-gradient(120deg,var(--green-deep),var(--green));border-radius:20px;padding:56px;color:#fff}
.cta-card h2{color:#fff}
.cta-card .section-kicker.light{color:rgba(255,255,255,.85)}

/* footer */
footer{background:var(--cream);border-top:1px solid var(--line);padding:64px 0 32px}
.footer-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:32px;margin-bottom:48px}
.footer-grid p{color:var(--muted);font-size:.92rem;margin-top:10px;max-width:220px}
.footer-grid h4{font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:14px}
.footer-grid a{display:block;font-size:.92rem;color:var(--ink);padding:5px 0}
.footer-grid a:hover{color:var(--green-deep)}
.footer-guides{border-top:1px solid var(--line);padding-top:40px;margin-bottom:40px}
.footer-guides-heading{max-width:520px;margin-bottom:20px}
.footer-guides-heading h3{font-size:1.3rem;margin-bottom:8px}
.footer-guides-heading p{color:var(--muted);font-size:.95rem}
.footer-guides nav{display:flex;flex-wrap:wrap;gap:8px 24px}
.footer-guides nav a{font-size:.9rem;color:var(--muted)}
.footer-guides nav a:hover{color:var(--green-deep)}
.footer-bottom{display:flex;justify-content:space-between;gap:16px;border-top:1px solid var(--line);padding-top:24px;font-size:.85rem;color:var(--muted);flex-wrap:wrap}

/* responsive */
@media(max-width:900px){
  .main-nav{display:none}
  .menu-toggle{display:block}
  .header-actions .btn-outline{display:none}
  .dual-grid,.steps-grid,.why-grid{grid-template-columns:1fr}
  .section-heading{flex-direction:column;align-items:flex-start}
  .vacancies-heading{flex-direction:column;align-items:flex-start}
  .cta-card{flex-direction:column;align-items:flex-start;padding:40px}
  .footer-grid{grid-template-columns:1fr 1fr}
}
`;

// ---------------------------------------------------------------------------
// JS — tiny interactions
// ---------------------------------------------------------------------------

const js = `document.querySelector('.menu-toggle').addEventListener('click', function () {
  const nav = document.querySelector('.main-nav');
  const open = nav.style.display === 'flex';
  nav.style.display = open ? '' : 'flex';
  nav.style.position = 'absolute';
  nav.style.top = '68px';
  nav.style.left = '0';
  nav.style.right = '0';
  nav.style.flexDirection = 'column';
  nav.style.background = '#fff';
  nav.style.padding = '16px 24px';
  nav.style.borderBottom = '1px solid var(--line)';
  this.setAttribute('aria-expanded', String(!open));
});

document.querySelectorAll('.filter-chip').forEach(function (chip) {
  chip.addEventListener('click', function () {
    document.querySelectorAll('.filter-chip').forEach(function (c) {
      c.classList.remove('active');
      c.setAttribute('aria-selected', 'false');
    });
    chip.classList.add('active');
    chip.setAttribute('aria-selected', 'true');
  });
});
`;

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------

fs.mkdirSync(path.join(OUT, 'css'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');
fs.writeFileSync(path.join(OUT, 'css', 'styles.css'), css, 'utf8');
fs.writeFileSync(path.join(OUT, 'js', 'main.js'), js, 'utf8');

console.log('Wrote exports/teamloop/:');
for (const f of ['index.html', 'css/styles.css', 'js/main.js']) {
  const abs = path.join(OUT, f);
  console.log(' ', f, fs.statSync(abs).size, 'bytes');
}
