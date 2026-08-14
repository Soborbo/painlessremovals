import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const stageDir = path.resolve(scriptDir, "../tmp/ytl-rebuild");
const sourcePath = path.join(stageDir, "painless-ytl-commercial-detail.html");
const outputPath = path.join(stageDir, "painless-ytl-commercial-detail-v2.2.html");
const michelleImageSource = path.resolve(scriptDir, "../public/images/reviews/michelle-hayes.avif");
const michelleImageOutput = path.join(stageDir, "rev-michelle-hayes.avif");
const proximityImageSource = path.resolve(scriptDir, "../public/images/ytl-proximity-team.jpg");
const proximityImageOutput = path.join(stageDir, "kocsi.jpg");
const timingImageSource = path.resolve(scriptDir, "../public/images/ytl-cipeles.jpg");
const timingImageOutput = path.join(stageDir, "cipeles.jpg");
const storageImageSource = path.resolve(scriptDir, "../public/images/ytl-morestorage.jpg");
const storageImageOutput = path.join(stageDir, "morestorage.jpg");

const source = fs.readFileSync(sourcePath, "utf8");
fs.copyFileSync(michelleImageSource, michelleImageOutput);
fs.copyFileSync(proximityImageSource, proximityImageOutput);
fs.copyFileSync(timingImageSource, timingImageOutput);
fs.copyFileSync(storageImageSource, storageImageOutput);

const v2Css = String.raw`

  /* ===========================================================
     V2.2 - PRINT-SAFE STRUCTURE AND COMPACT SALES COMPONENTS
     =========================================================== */
  .page {
    height:297mm;
    page-break-after:always;
    page-break-inside:avoid;
    break-inside:avoid-page;
    isolation:isolate;
  }
  .page:last-of-type { page-break-after:auto; break-after:auto; }

  .lockup {
    display:grid;
    grid-template-columns:minmax(0,1fr) auto;
  }
  .footer {
    display:grid;
    grid-template-columns:minmax(0,1fr) auto auto;
    column-gap:5mm;
    margin-top:auto;
  }
  .footer-left {
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-size:8pt;
  }
  .footer-right {
    gap:4mm;
    font-size:7.6pt;
  }
  .footer-page {
    min-width:16mm;
    text-align:right;
    color:rgba(245,247,242,.55);
    font-size:7.5pt;
    letter-spacing:.12em;
    white-space:nowrap;
  }
  .footer-right { display:flex; }
  .footer-right .phone-link,
  .next-steps .phone-link {
    color:var(--terra-bright);
    font-weight:700;
    text-decoration:none;
    white-space:nowrap;
  }
  .next-steps .phone-link {
    font-family:var(--serif);
    font-size:20pt;
    letter-spacing:.01em;
    line-height:1;
  }
  .next-steps .web a {
    color:#aec6dd;
    text-decoration:none;
  }
  .cover-copy h1 em {
    display:inline-block;
    white-space:nowrap;
  }

  .page-kicker {
    font-size:7.4pt;
    letter-spacing:.2em;
    text-transform:uppercase;
    color:var(--gold-700);
    font-weight:700;
    margin-bottom:2.5mm;
  }
  .benefit-grid {
    display:grid;
    grid-template-columns:repeat(2,1fr);
    gap:4mm;
  }
  .benefit-card {
    background:var(--warm-white);
    border:1px solid var(--warm-gray-100);
    border-left:3px solid var(--gold-500);
    padding:5mm 6mm;
  }
  .benefit-card h3 {
    font-family:var(--serif);
    font-size:14pt;
    line-height:1.16;
    color:var(--primary-800);
    margin-bottom:2.2mm;
  }
  .benefit-card h3 em { color:var(--terra-bright); font-style:italic; }
  .benefit-card p {
    font-size:8.8pt;
    line-height:1.48;
    color:var(--ink);
  }
  .benefit-card p strong { color:var(--primary-900); }

  .compact-icards .icard .iph {
    height:auto;
    aspect-ratio:3/2;
    background:#f1eee8;
  }
  .compact-icards .icard .iph img {
    width:100%;
    height:100%;
    object-fit:cover;
  }
  .compact-icards .icard .ibody { padding:4.5mm 5mm 5mm; }
  .compact-icards .icard h4 { font-size:12pt; margin-bottom:2mm; }
  .compact-icards .icard p { font-size:8.1pt; line-height:1.42; }

  .scenario-grid {
    display:grid;
    grid-template-columns:repeat(3,1fr);
    gap:4mm;
  }
  .scenario-card {
    background:var(--warm-white);
    border:1px solid var(--warm-gray-100);
    border-top:3px solid var(--gold-500);
    padding:5mm 5.5mm;
  }
  .scenario-card .eyebrow {
    font-size:6.8pt;
    letter-spacing:.18em;
    text-transform:uppercase;
    color:var(--gold-700);
    font-weight:700;
    margin-bottom:2mm;
  }
  .scenario-card h3 {
    font-family:var(--serif);
    color:var(--primary-800);
    font-size:13pt;
    line-height:1.15;
    min-height:10mm;
  }
  .scenario-card .total {
    font-family:var(--serif);
    color:var(--terra-bright);
    font-size:16.5pt;
    font-weight:600;
    margin:3mm 0 2.5mm;
  }
  .scenario-card p {
    font-size:8.1pt;
    line-height:1.42;
    color:var(--warm-gray-500);
  }
  .scenario-card p strong { color:var(--primary-900); }

  .price-main { display:block; }
  .price-main .inc {
    font-family:var(--serif);
    font-size:14pt;
    color:var(--terra-bright);
    font-weight:600;
    line-height:1.05;
  }
  .price-main .ex {
    display:block;
    margin-top:1.2mm;
    font-size:7.2pt;
    letter-spacing:.06em;
    text-transform:uppercase;
    color:var(--warm-gray-400);
  }
  .ptable tbody td { padding:6.3mm 7mm; }

  .pack-grid {
    display:grid;
    grid-template-columns:repeat(5,1fr);
    gap:3mm;
  }
  .pack-card {
    background:var(--warm-white);
    border:1px solid var(--warm-gray-100);
    border-top:3px solid var(--gold-500);
    padding:4.5mm 4mm;
  }
  .pack-card.featured { border-color:var(--terra-bright); }
  .pack-card .pack-name {
    font-family:var(--serif);
    font-size:12.5pt;
    font-weight:600;
    color:var(--primary-800);
    line-height:1.1;
  }
  .pack-card .pack-for {
    color:var(--warm-gray-500);
    font-size:7.4pt;
    line-height:1.35;
    min-height:9mm;
    margin-top:1.3mm;
  }
  .pack-card .pack-price {
    font-family:var(--serif);
    font-size:18pt;
    color:var(--terra-bright);
    font-weight:600;
    margin:3mm 0;
    line-height:1;
  }
  .pack-card .pack-price small {
    display:block;
    font-family:var(--sans);
    font-size:6.8pt;
    color:var(--warm-gray-400);
    font-weight:500;
    margin-top:1.2mm;
  }
  .pack-card ul { list-style:none; }
  .pack-card li {
    border-top:1px solid var(--warm-gray-100);
    padding:2.3mm 0;
    font-size:7.3pt;
    line-height:1.33;
  }
  .pack-card li:first-child { border-top:none; }

  .source-note {
    margin-top:4mm;
    padding:3.5mm 4.5mm;
    background:#f1eee8;
    border-left:3px solid var(--warm-gray-400);
    color:var(--warm-gray-500);
    font-size:7.7pt;
    line-height:1.45;
  }
  .source-note strong { color:var(--primary-900); }

  .response-list {
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:4mm;
  }
  .response-card {
    background:var(--warm-white);
    border:1px solid var(--warm-gray-100);
    border-left:3px solid var(--gold-500);
    padding:4mm 4.5mm;
    display:grid;
    grid-template-columns:1fr 34mm;
    gap:3.5mm;
  }
  .response-card h3 {
    font-family:var(--serif);
    font-size:12.5pt;
    color:var(--primary-800);
    line-height:1.14;
    margin-bottom:2mm;
  }
  .response-card p {
    font-size:7.7pt;
    line-height:1.4;
  }
  .response-card .answer {
    background:var(--cream);
    border-left:2px solid var(--gold-500);
    padding:2.5mm;
  }
  .response-card .answer .lbl {
    font-size:6.5pt;
    text-transform:uppercase;
    letter-spacing:.16em;
    color:var(--gold-700);
    font-weight:700;
  }
  .response-card .answer .amt {
    font-family:var(--serif);
    font-size:11pt;
    line-height:1.15;
    color:var(--terra-bright);
    font-weight:600;
    margin-top:1.6mm;
  }
  .response-card .answer .detail {
    font-size:6.8pt;
    line-height:1.35;
    color:var(--warm-gray-500);
    margin-top:1.5mm;
  }

  .proof-grid {
    display:grid;
    grid-template-columns:repeat(3,1fr);
    gap:4mm;
  }
  .proof-box {
    background:var(--warm-white);
    border:1px solid var(--warm-gray-100);
    border-top:3px solid var(--gold-500);
    padding:4.5mm 5mm;
    text-align:center;
  }
  .proof-box .proof-logo {
    height:20mm;
    display:flex;
    align-items:center;
    justify-content:center;
    margin-bottom:2.5mm;
  }
  .proof-box .proof-logo img {
    max-height:20mm;
    max-width:42mm;
    object-fit:contain;
  }
  .proof-box h3 {
    font-family:var(--serif);
    color:var(--primary-800);
    font-size:10.5pt;
    margin-bottom:1mm;
  }
  .proof-box p {
    color:var(--warm-gray-500);
    font-size:7.5pt;
    line-height:1.4;
  }

  .rev-row.v2 .rev-bubble { min-height:56mm; padding:4.5mm 5mm; }
  .rev-row.v2 .rev-bubble .q { font-size:8pt; }

  .map-figure.map-compact { width:100mm; }
  .map-compact img { width:100%; height:auto; object-fit:contain; }
  .cmp.compact tbody td { padding:4.5mm 3mm; }
  .cmp.compact .val { font-size:11.5pt; }
  .stable tbody td { padding:4.2mm 3mm; }
  .benefit-grid .benefit-card { padding:4.3mm 5mm; }

  .version-stamp {
    font-size:6.7pt;
    letter-spacing:.14em;
    text-transform:uppercase;
    color:var(--warm-gray-400);
    margin-top:2mm;
  }

  .team-grid .person .role,
  .team-grid .person h3 {
    white-space:nowrap;
  }
  .team-grid .person .role {
    font-size:7.2pt;
    min-height:4mm;
  }
  .team-grid .person h3 {
    min-height:7mm;
  }

  .storage-page .stable tbody td {
    padding:3.7mm 3mm;
  }
  .storage-page .source-note {
    margin-top:2.5mm;
    padding:3mm 4mm;
    font-size:7.4pt;
  }
  .timing-page .footer {
    margin-top:0;
  }
  .timing-page .timing-close {
    margin-top:auto;
    margin-bottom:auto;
    padding-top:0 !important;
  }

  .proximity-layout {
    display:grid;
    grid-template-columns:82mm minmax(0,1fr);
    gap:5mm;
    align-items:start;
  }
  .proximity-page .map-figure.map-compact {
    width:82mm;
  }
  .proximity-page .scenario-grid {
    grid-template-columns:1fr;
    gap:2.5mm;
  }
  .proximity-page .scenario-card {
    display:grid;
    grid-template-columns:minmax(0,1fr) auto;
    column-gap:3mm;
    padding:3mm 4mm;
  }
  .proximity-page .scenario-card .eyebrow {
    grid-column:1;
    margin-bottom:1mm;
  }
  .proximity-page .scenario-card h3 {
    grid-column:1;
    min-height:0;
    font-size:11.5pt;
  }
  .proximity-page .scenario-card .total {
    grid-column:2;
    grid-row:1 / 3;
    align-self:center;
    margin:0;
    font-size:13pt;
    white-space:nowrap;
  }
  .proximity-page .scenario-card p {
    grid-column:1 / -1;
    margin-top:1.3mm;
    font-size:7.2pt;
    line-height:1.35;
  }

  .featured-review {
    background:var(--warm-white);
    border:1px solid var(--warm-gray-100);
    border-left:3px solid var(--terra-bright);
    padding:5mm 6mm;
    display:grid;
    grid-template-columns:minmax(0,1fr) auto;
    column-gap:7mm;
    align-items:end;
  }
  .featured-review .stars {
    grid-column:1 / -1;
    color:var(--gold-500);
    font-size:10pt;
    letter-spacing:1.5px;
    line-height:1;
    margin-bottom:2.5mm;
  }
  .featured-review .quote {
    font-family:var(--serif);
    font-style:italic;
    font-size:11pt;
    line-height:1.42;
    color:var(--primary-800);
  }
  .featured-review .quote mark {
    background:var(--gold-200);
    color:var(--primary-900);
    padding:0 1px;
    border-radius:1px;
  }
  .featured-review .rev-meta {
    min-width:39mm;
  }
  .featured-review .review-avatar {
    width:9mm;
    height:9mm;
    border-radius:50%;
    overflow:hidden;
    border:1.5px solid var(--gold-200);
    flex:0 0 auto;
  }
  .featured-review .review-avatar img {
    width:100%;
    height:100%;
    border:0;
    border-radius:0;
    object-fit:cover;
    object-position:center 62%;
    transform:scale(1.3);
  }

  .team-page .footer {
    margin-top:0;
  }
  .team-page .team-review {
    margin-top:auto;
    padding-top:0 !important;
  }
  .team-page .team-cta {
    margin-top:auto;
    margin-bottom:auto;
    padding-top:0 !important;
  }

  .page:not(:first-of-type) .lockup {
    display:block;
    height:5mm;
    min-height:5mm;
    padding:0;
    background:var(--primary-900);
  }
  .page:not(:first-of-type) .lockup > * { display:none; }
  .page:not(:first-of-type) .footer {
    grid-template-columns:1fr;
  }
  .page:not(:first-of-type) .footer-right { display:none; }
  .page:not(:first-of-type) .footer-left {
    display:none;
  }
  .page:not(:first-of-type) .footer-page { justify-self:end; }

  @media print {
    .page {
      width:210mm;
      height:297mm;
      margin:0;
      box-shadow:none;
      page-break-inside:avoid;
      break-inside:avoid-page;
    }
    .page:first-of-type .lockup, .footer { display:grid !important; }
    .page:not(:first-of-type) .lockup { display:block !important; }
  }

  @media screen and (max-width:850px) {
    html, body { font-size:16px; }
    body { padding:0; background:var(--cream); }
    .page {
      width:100%;
      height:auto;
      min-height:0;
      margin:0;
      box-shadow:none;
      transform:none;
      overflow:visible;
      break-after:auto;
    }
    .lockup { grid-template-columns:1fr; gap:4mm; padding:5mm 6vw; }
    .lockup-right { text-align:left; }
    .lockup-right .partner-name .brab-lockup { margin-left:0; }
    .sec { padding-left:6vw; padding-right:6vw; }
    .sec-title { font-size:25pt; }
    .cover-hero { height:48vw; min-height:58mm; }
    .cover-copy, .cover-prepared { padding-left:6vw; padding-right:6vw; }
    .cover-stats, .toc, .next-steps, .scenario-grid, .benefit-grid,
    .pack-grid, .response-list, .proof-grid, .team-grid, .trio,
    .rev-row, .accred-row, .incl-row {
      grid-template-columns:1fr;
    }
    .cover-stats { display:grid; gap:4mm; }
    .cover-stats .cdiv { display:none; }
    .toc, .next-steps { margin-left:6vw; margin-right:6vw; }
    .next-steps { grid-template-columns:1fr; }
    .next-steps .cta { text-align:left; }
    .ptable, .stable, .cmp { font-size:8pt; }
    .footer { position:static; grid-template-columns:1fr; gap:2mm; margin-top:10mm; }
    .footer-right { flex-wrap:wrap; }
    .footer-page { text-align:left; }
  }
`;

const body = String.raw`
<body>

<!-- ===================== PAGE 1 - COVER ===================== -->
<section class="page">
  <div class="lockup">
    <div class="lockup-left"><img class="brand" src="logo.svg" alt="Painless Removals"><div class="strap">Making removals painless since 1978</div></div>
    <div class="lockup-right"><div class="for-label">Commercial and operational detail for</div>
      <div class="partner-name"><img class="brab-lockup" src="brabazon-logo-white.svg" alt="Brabazon by YTL Developments"></div></div>
  </div>

  <div class="cover-hero"><img src="cover-runway-east.jpg" alt="A branded Painless Removals vehicle working in Bristol"></div>

  <div class="cover-stats">
    <div class="cstat"><div class="big">4.9 / 5</div><div class="lbl2">from 122 verified reviews</div></div>
    <div class="cdiv"></div>
    <div class="cstat"><div class="big">0.7 miles</div><div class="lbl2">storage to Brabazon</div></div>
    <div class="cdiv"></div>
    <div class="cstat"><div class="big">Since 1978</div><div class="lbl2">serving Bristol</div></div>
  </div>

  <div class="cover-mid">
    <div>
      <div class="cover-prepared"><span class="bar"></span> Partnership detail - version 2.0 - July 2026</div>
      <div class="cover-copy">
        <h1>A smoother move for every Brabazon buyer. <em>One local partner for everything around it.</em></h1>
        <p class="sub">
          Clear consumer pricing, planned access, professional packing, nearby storage and one accountable
          contact when timings change. <strong>Less operational work for the Brabazon team, and fewer unknowns
          for the buyer.</strong>
        </p>
      </div>
    </div>

    <div class="toc">
      <div class="toc-item"><div class="n">01</div><div class="t">The partnership model and what is included</div></div>
      <div class="toc-item"><div class="n">02</div><div class="t">Consumer prices and worked examples</div></div>
      <div class="toc-item"><div class="n">03</div><div class="t">Packing, storage and timing contingencies</div></div>
      <div class="toc-item"><div class="n">04</div><div class="t">The measured proximity advantage</div></div>
      <div class="toc-item"><div class="n">05</div><div class="t">Reviews, accreditation and references</div></div>
      <div class="toc-item"><div class="n">06</div><div class="t">Named contacts and an agreed next step</div></div>
    </div>

    <div class="next-steps">
      <div>
        <h3>Start with one practical working session.</h3>
        <p>We will agree the resident journey, published rate card, handover process and escalation route before any purchaser is referred.</p>
      </div>
      <div class="cta">
        <div class="label">Partnership contact</div><div class="name">Richard - Partnerships</div>
        <a class="phone-link" href="tel:+447838159742">07838 159 742</a><div class="web"><a href="mailto:richard@painlessremovals.com">richard@painlessremovals.com</a></div>
      </div>
    </div>
  </div>

  <div class="footer"><div class="footer-left">Painless Removals Ltd &middot; Bristol - on Brabazon's doorstep</div>
    <div class="footer-right"><a href="mailto:hello@painlessremovals.com">hello@painlessremovals.com</a><a class="phone-link" href="tel:+441172870082">0117 287 0082</a></div>
    <div class="footer-page">01 / 09</div></div>
</section>

<!-- ===================== PAGE 2 - PARTNERSHIP MODEL ===================== -->
<section class="page">
  <div class="lockup">
    <div class="lockup-left"><img class="brand" src="logo.svg" alt="Painless Removals"><div class="strap">Making removals painless since 1978</div></div>
    <div class="lockup-right"><div class="for-label">Commercial and operational detail for</div>
      <div class="partner-name"><img class="brab-lockup" src="brabazon-logo-white.svg" alt="Brabazon"></div></div>
  </div>

  <div class="sec">
    <div class="sec-marker">The partnership model</div>
    <h2 class="sec-title">One operational partner. <em>Less work for your team.</em></h2>
    <div class="sec-divider"></div>
    <p class="lead">The service is designed around the handover, not just the van. Painless plans access with the Brabazon team, surveys each home, confirms the buyer's scope and keeps communication clear through one named contact.</p>
  </div>

  <div class="sec" style="padding-top:9mm;">
    <div class="icard-grid compact-icards">
      <div class="icard"><div class="iph"><img src="inc-planned.jpg" alt="Pre-move planning"></div><div class="ibody">
        <div class="pt">Before the day</div><h4>Planned with <em>your team.</em></h4>
        <p>Access, parking, lift bookings, arrival windows and building requirements are agreed before the crew arrives.</p>
      </div></div>
      <div class="icard"><div class="iph"><img src="inc-protected.jpg" alt="Furniture being carefully protected"></div><div class="ibody">
        <div class="pt">On the day</div><h4>Protected <em>throughout the move.</em></h4>
        <p>Furniture protection, floor coverings and agreed dismantling are included in the surveyed removal scope.</p>
      </div></div>
      <div class="icard"><div class="iph"><img src="inc-insured.jpg" alt="A branded Painless Removals vehicle" style="object-position:center 72%;"></div><div class="ibody">
        <div class="pt">Behind the work</div><h4>Accountable <em>from start to finish.</em></h4>
        <p>Employed crews, branded vehicles, public liability cover and goods-in-transit cover up to £15,000 per van, subject to policy terms.</p>
      </div></div>
    </div>
  </div>

  <div class="sec" style="padding-top:8mm;">
    <div class="benefit-grid">
      <div class="benefit-card"><div class="page-kicker">For Brabazon</div><h3>One route for <em>every moving-day question.</em></h3>
        <p>Your sales and concierge teams are not left coordinating removers, storage firms and delivery changes. <strong>Painless provides one clear operational contact.</strong></p></div>
      <div class="benefit-card"><div class="page-kicker">For the buyer</div><h3>A clear scope, <em>price and fallback plan.</em></h3>
        <p>The buyer sees what is included, what is optional and what happens if keys or completion timings move. <strong>No open-ended promises and no undefined extras.</strong></p></div>
    </div>
  </div>

  <div class="sec" style="padding-top:8mm;">
    <div class="incl-strip">
      <div class="incl-lbl">Every surveyed Brabazon removal includes</div>
      <ul class="incl-row">
        <li><span class="tick">✓</span><div>Pre-move planning and access coordination</div></li>
        <li><span class="tick">✓</span><div>Furniture protection and floor coverings</div></li>
        <li><span class="tick">✓</span><div>Agreed dismantling and reassembly</div></li>
        <li><span class="tick">✓</span><div>Uniformed, employed crews and branded vehicles</div></li>
      </ul>
    </div>
  </div>

  <div class="footer"><div class="footer-left">Painless Removals Ltd &middot; One accountable operational partner</div>
    <div class="footer-right"><a href="mailto:hello@painlessremovals.com">hello@painlessremovals.com</a><a class="phone-link" href="tel:+441172870082">0117 287 0082</a></div>
    <div class="footer-page">02 / 09</div></div>
</section>

<!-- ===================== PAGE 3 - PRICES AND WORKED EXAMPLES ===================== -->
<section class="page">
  <div class="lockup">
    <div class="lockup-left"><img class="brand" src="logo.svg" alt="Painless Removals"><div class="strap">Making removals painless since 1978</div></div>
    <div class="lockup-right"><div class="for-label">Commercial and operational detail for</div>
      <div class="partner-name"><img class="brab-lockup" src="brabazon-logo-white.svg" alt="Brabazon"></div></div>
  </div>

  <div class="sec">
    <div class="sec-marker">Indicative consumer pricing</div>
    <h2 class="sec-title">Priced by volume. <em>Fixed after survey.</em></h2>
    <div class="sec-divider"></div>
    <p class="lead">Bedroom count is only a guide. The fixed quote follows a free survey of the actual volume, access and agreed services. The consumer total is shown first, with the ex-VAT basis underneath.</p>
  </div>

  <div class="sec" style="padding-top:8mm;">
    <table class="ptable">
      <thead><tr><th style="width:31mm;" scope="col">Van load</th><th scope="col">Typical profile</th><th class="num" style="width:48mm;" scope="col">Indicative consumer total</th></tr></thead>
      <tbody>
        <tr><td class="load">1 van</td><td class="desc">Smaller 1-2 bedroom move<span>Minimal loft, garage or shed contents</span></td><td class="price"><span class="price-main"><span class="inc">from £768</span><span class="ex">£640 ex VAT</span></span></td></tr>
        <tr><td class="load">2 vans</td><td class="desc">Typical 2-3 bedroom home<span>The most common Brabazon profile</span></td><td class="price"><span class="price-main"><span class="inc">£1,200-£1,440</span><span class="ex">£1,000-£1,200 ex VAT</span></span></td></tr>
        <tr><td class="load">3 vans</td><td class="desc">Typical 3-4 bedroom home<span>Family home with garage or loft contents</span></td><td class="price"><span class="price-main"><span class="inc">£1,800-£2,160</span><span class="ex">£1,500-£1,800 ex VAT</span></span></td></tr>
        <tr><td class="load">4 vans</td><td class="desc">Larger 4-5 bedroom move<span>High volume, often combined with packing</span></td><td class="price"><span class="price-main"><span class="inc">£2,160-£2,400</span><span class="ex">£1,800-£2,000 ex VAT</span></span></td></tr>
      </tbody>
    </table>
  </div>

  <div class="sec" style="padding-top:8mm;">
    <div class="scenario-grid">
      <div class="scenario-card"><div class="eyebrow">Worked example 01</div><h3>Smaller home, move only</h3>
        <div class="total">from £768</div><p><strong>1 van removal.</strong> Packing and storage not included.</p></div>
      <div class="scenario-card"><div class="eyebrow">Worked example 02</div><h3>2-3 bed home with medium full pack</h3>
        <div class="total">£1,896-£2,136</div><p><strong>2 van move plus £696 packing.</strong> Storage not included.</p></div>
      <div class="scenario-card"><div class="eyebrow">Worked example 03</div><h3>3-4 bed home with large full pack</h3>
        <div class="total">£2,670-£3,030</div><p><strong>3 van move plus £870 packing.</strong> Storage not included.</p></div>
    </div>
  </div>

  <div class="sec" style="padding-top:7mm;">
    <div class="source-note"><strong>Pricing basis:</strong> VAT calculated at 20%. Indicative rate snapshot, July 2026. Final scope, fixed total, quote validity and any separately priced packing, storage or delay contingency are confirmed after survey and before booking.</div>
  </div>

  <div class="footer"><div class="footer-left">Painless Removals Ltd &middot; Clear consumer totals before booking</div>
    <div class="footer-right"><a href="mailto:hello@painlessremovals.com">hello@painlessremovals.com</a><a class="phone-link" href="tel:+441172870082">0117 287 0082</a></div>
    <div class="footer-page">03 / 09</div></div>
</section>

<!-- ===================== PAGE 4 - PACKING ===================== -->
<section class="page">
  <div class="lockup">
    <div class="lockup-left"><img class="brand" src="logo.svg" alt="Painless Removals"><div class="strap">Making removals painless since 1978</div></div>
    <div class="lockup-right"><div class="for-label">Commercial and operational detail for</div>
      <div class="partner-name"><img class="brab-lockup" src="brabazon-logo-white.svg" alt="Brabazon"></div></div>
  </div>

  <div class="cover-hero" style="height:70mm;"><img src="pk-hero.jpg" alt="A Painless Removals team member professionally packing a home" style="object-position:center 10%;"></div>

  <div class="sec" style="padding-top:9mm;">
    <div class="sec-marker">Packing options</div>
    <h2 class="sec-title">Choose how much to hand over. <em>Every material included.</em></h2>
    <div class="sec-divider"></div>
    <p class="lead">Packing is completed before moving day. Prices below show the consumer total including VAT; the final tier follows the surveyed volume and agreed scope.</p>
  </div>

  <div class="sec" style="padding-top:7mm;">
    <div class="pack-grid">
      <div class="pack-card featured"><div class="pack-name">Fragile only</div><div class="pack-for">Kitchenware, art, mirrors and delicate items</div><div class="pack-price">£522<small>£435 ex VAT</small></div>
        <ul><li>Specialist fragile packing</li><li>All materials included</li><li>Scope agreed at survey</li></ul></div>
      <div class="pack-card"><div class="pack-name">Small</div><div class="pack-for">Flats and smaller homes</div><div class="pack-price">£474<small>£395 ex VAT</small></div>
        <ul><li>250-750 cu ft</li><li>2-person team</li><li>Up to half a day</li></ul></div>
      <div class="pack-card featured"><div class="pack-name">Medium</div><div class="pack-for">Typical 2-3 bedroom home</div><div class="pack-price">£696<small>£580 ex VAT</small></div>
        <ul><li>751-1,350 cu ft</li><li>3-person team</li><li>Up to half a day</li></ul></div>
      <div class="pack-card"><div class="pack-name">Large</div><div class="pack-for">Typical 3-4 bedroom home</div><div class="pack-price">£870<small>£725 ex VAT</small></div>
        <ul><li>1,351-2,000 cu ft</li><li>4-person team</li><li>Up to one day</li></ul></div>
      <div class="pack-card"><div class="pack-name">Extra</div><div class="pack-for">5+ bedrooms or unusually high volume</div><div class="pack-price">£1,188<small>£990 ex VAT</small></div>
        <ul><li>2,001+ cu ft</li><li>5-person team</li><li>Up to two days</li></ul></div>
    </div>
  </div>

  <div class="sec" style="padding-top:8mm;">
    <div class="benefit-grid">
      <div class="benefit-card"><div class="page-kicker">Included in every tier</div><h3>Boxes, paper, tape and <em>professional wrap.</em></h3>
        <p>There is no separate packing-materials bill for the agreed service. Items outside the surveyed scope are discussed before work continues.</p></div>
      <div class="benefit-card"><div class="page-kicker">Timing</div><h3>Packed before moving day, <em>labelled by room.</em></h3>
        <p>The crew arrives on moving morning to load, not to discover an unfinished home. Buyers who pack themselves can use the free online packing course.</p></div>
    </div>
  </div>

  <div class="footer"><div class="footer-left">Painless Removals Ltd &middot; Packing scope and price confirmed at survey</div>
    <div class="footer-right"><a href="mailto:hello@painlessremovals.com">hello@painlessremovals.com</a><a class="phone-link" href="tel:+441172870082">0117 287 0082</a></div>
    <div class="footer-page">04 / 09</div></div>
</section>

<!-- ===================== PAGE 5 - STORAGE ===================== -->
<section class="page storage-page">
  <div class="lockup">
    <div class="lockup-left"><img class="brand" src="logo.svg" alt="Painless Removals"><div class="strap">Making removals painless since 1978</div></div>
    <div class="lockup-right"><div class="for-label">Commercial and operational detail for</div>
      <div class="partner-name"><img class="brab-lockup" src="brabazon-logo-white.svg" alt="Brabazon"></div></div>
  </div>

  <div class="cover-hero" style="height:70mm;"><img src="morestorage.jpg" alt="MORE! Self Storage on Bolingbroke Way in Bristol" style="object-position:center center;"></div>

  <div class="sec" style="padding-top:6mm;">
    <div class="sec-marker">Storage - Bolingbroke Way, Filton</div>
    <h2 class="sec-title">Nearby space when timing or handover <em>needs flexibility.</em></h2>
    <div class="sec-divider"></div>
    <p class="lead">The MORE! Bristol store is 0.7 miles from Brabazon, open and staffed seven days a week, with covered loading bays, CCTV and individually controlled units.</p>
  </div>

  <div class="sec" style="padding-top:5mm;">
    <table class="stable">
      <thead><tr><th scope="col">Unit</th><th scope="col">Typically holds</th><th scope="col">Indicative promo<br>per week</th><th scope="col">Example offer<br>term</th><th scope="col">Standard<br>4-weekly</th></tr></thead>
      <tbody>
        <tr><td class="size">75 sq ft</td><td class="holds">Luton van load<span>1-2 bedroom home</span></td><td class="offer">£21.04</td><td class="term">8 weeks</td><td class="std">£210.40</td></tr>
        <tr><td class="size">125 sq ft</td><td class="holds">Large garage<span>2-3 bedroom home</span></td><td class="offer">£27.20</td><td class="term">8 weeks</td><td class="std">£272.00</td></tr>
        <tr><td class="size">175 sq ft</td><td class="holds">Small removal lorry<span>3-4 bedroom home</span></td><td class="offer">£58.50</td><td class="term">13 weeks</td><td class="std">£468.00</td></tr>
        <tr><td class="size">250 sq ft</td><td class="holds">Full house load<span>4 bedroom home and above</span></td><td class="offer">£83.00</td><td class="term">8 weeks</td><td class="std">£664.00</td></tr>
      </tbody>
    </table>
  </div>

  <div class="sec" style="padding-top:5mm;">
    <div class="benefit-grid">
      <div class="benefit-card"><div class="page-kicker">For the buyer</div><h3>One company coordinates <em>the move and the store.</em></h3>
        <p>Painless can arrange the physical move into storage and the later delivery, so the buyer is not left coordinating two suppliers on completion day.</p></div>
      <div class="benefit-card"><div class="page-kicker">Commercial clarity</div><h3>Storage, handling and redelivery <em>shown separately.</em></h3>
        <p>The unit rent is not presented as the total contingency cost. Any handling and redelivery are quoted before the buyer commits.</p></div>
    </div>
    <div class="source-note"><strong>Supplier rate snapshot, July 2026:</strong> promotions and availability can change. Exact rent, VAT treatment, access hours and Painless handling/redelivery charges are confirmed at booking.</div>
  </div>

  <div class="footer"><div class="footer-left">Painless Removals Ltd &middot; Nearby storage with the full cost explained</div>
    <div class="footer-right"><a href="mailto:hello@painlessremovals.com">hello@painlessremovals.com</a><a class="phone-link" href="tel:+441172870082">0117 287 0082</a></div>
    <div class="footer-page">05 / 09</div></div>
</section>

<!-- ===================== PAGE 6 - TIMING CONTINGENCIES ===================== -->
<section class="page timing-page">
  <div class="lockup">
    <div class="lockup-left"><img class="brand" src="logo.svg" alt="Painless Removals"><div class="strap">Making removals painless since 1978</div></div>
    <div class="lockup-right"><div class="for-label">Commercial and operational detail for</div>
      <div class="partner-name"><img class="brab-lockup" src="brabazon-logo-white.svg" alt="Brabazon"></div></div>
  </div>

  <div class="cover-hero" style="height:70mm;"><img src="cipeles.jpg" alt="Painless Removals team members carrying furniture" style="object-position:center center;"></div>

  <div class="sec" style="padding-top:6mm;">
    <div class="sec-marker">When timings change</div>
    <h2 class="sec-title">When plans change, <em>we stay involved.</em></h2>
    <div class="sec-divider"></div>
    <p class="lead">Every contingency is discussed at survey. The quote states what is included, what triggers a separate charge and who the buyer or Brabazon team calls.</p>
  </div>

  <div class="sec" style="padding-top:5mm;">
    <div class="response-list">
      <div class="response-card"><div><h3>What if the keys are late?</h3><p>The crew remains available for the agreed window. Any charge outside that window uses the basis written into the buyer's quote.</p></div>
        <div class="answer"><div class="lbl">Indicative contingency</div><div class="amt">£96-£108 incl VAT</div><div class="detail">Typical surveyed 2-van, 3-person move. Exact trigger and basis confirmed in writing.</div></div></div>
      <div class="response-card"><div><h3>What if completion slips a day?</h3><p>If storage has been planned and booked, the load can move into the nearby facility and return when access is granted. Rent, handling and redelivery are shown separately.</p></div>
        <div class="answer"><div class="lbl">Planned option</div><div class="amt">Nearby storage</div><div class="detail">Subject to advance agreement and availability. Handling and redelivery are quoted separately.</div></div></div>
      <div class="response-card"><div><h3>What if something unexpected happens?</h3><p>We do not think like a company that only moves boxes. We stay involved, help work through the problem and look for the most practical next step we can reasonably support.</p></div>
        <div class="answer"><div class="lbl">Our approach</div><div class="amt">Go the extra mile</div><div class="detail">Stay involved, communicate clearly and help find a practical way forward.</div></div></div>
      <div class="response-card"><div><h3>What if the site changes on the day?</h3><p>We help the buyer and site team understand what has changed, communicate the available options clearly and agree the next practical step.</p></div>
        <div class="answer"><div class="lbl">Partner mindset</div><div class="amt">Help first</div><div class="detail">Practical support and clear communication, without promises we cannot keep.</div></div></div>
    </div>
  </div>

  <div class="sec timing-close">
    <div class="closeband" style="margin-left:0; margin-right:0;"><h3>The promise is clarity, <em>not an unrealistic guarantee.</em></h3>
      <p>The surveyed removal price covers the agreed labour, vehicles, protection and handling. Optional services and changes outside the agreed scope are priced separately and approved before they are incurred.</p></div>
  </div>

  <div class="footer"><div class="footer-left">Painless Removals Ltd &middot; Agreed triggers and one escalation route</div>
    <div class="footer-right"><a href="mailto:hello@painlessremovals.com">hello@painlessremovals.com</a><a class="phone-link" href="tel:+441172870082">0117 287 0082</a></div>
    <div class="footer-page">06 / 09</div></div>
</section>

<!-- ===================== PAGE 7 - PROXIMITY ===================== -->
<section class="page proximity-page">
  <div class="lockup">
    <div class="lockup-left"><img class="brand" src="logo.svg" alt="Painless Removals"><div class="strap">Making removals painless since 1978</div></div>
    <div class="lockup-right"><div class="for-label">Commercial and operational detail for</div>
      <div class="partner-name"><img class="brab-lockup" src="brabazon-logo-white.svg" alt="Brabazon"></div></div>
  </div>

  <div class="cover-hero" style="height:70mm;"><img src="kocsi.jpg" alt="The Painless Removals team with a removals vehicle" style="object-position:center center;"></div>

  <div class="sec" style="padding-top:6mm;">
    <div class="sec-marker">The proximity advantage, measured</div>
    <h2 class="sec-title">Close enough to be <em>genuinely useful.</em></h2>
    <div class="sec-divider"></div>
    <p class="lead">Proximity does not guarantee capacity or an instant response. It means the two Painless locations that support a Brabazon move are nearby, reducing routine travel and making planned storage handovers simpler.</p>
  </div>

  <div class="sec" style="padding-top:5mm;">
    <div class="proximity-layout">
      <div class="map-figure map-compact">
        <img src="map-v4.jpg" alt="Map showing Brabazon, Painless Removals headquarters and nearby storage">
        <div class="map-cap">Painless headquarters is 1.2 miles from Brabazon and the Filton storage site is 0.7 miles away.</div>
      </div>
      <div class="scenario-grid">
        <div class="scenario-card"><div class="eyebrow">Nearby storage</div><h3>Filton storage facility</h3><div class="total">0.7 miles</div><p>Close enough to make pre-arranged short-term storage a practical part of the moving plan.</p></div>
        <div class="scenario-card"><div class="eyebrow">Local headquarters</div><h3>North Bristol base</h3><div class="total">1.2 miles</div><p>The operational base is nearby, rather than across the city or outside the region.</p></div>
        <div class="scenario-card"><div class="eyebrow">One local network</div><h3>Move, store and follow-up</h3><div class="total">One partner</div><p>The same company stays involved across the move, storage coordination and agreed next steps.</p></div>
      </div>
    </div>
  </div>

  <div class="footer"><div class="footer-left">Painless Removals Ltd &middot; A transparent proximity calculation</div>
    <div class="footer-right"><a href="mailto:hello@painlessremovals.com">hello@painlessremovals.com</a><a class="phone-link" href="tel:+441172870082">0117 287 0082</a></div>
    <div class="footer-page">07 / 09</div></div>
</section>

<!-- ===================== PAGE 8 - PROOF ===================== -->
<section class="page">
  <div class="lockup">
    <div class="lockup-left"><img class="brand" src="logo.svg" alt="Painless Removals"><div class="strap">Making removals painless since 1978</div></div>
    <div class="lockup-right"><div class="for-label">Commercial and operational detail for</div>
      <div class="partner-name"><img class="brab-lockup" src="brabazon-logo-white.svg" alt="Brabazon"></div></div>
  </div>

  <div class="sec">
    <div class="sec-marker">Evidence your team can stand behind</div>
    <h2 class="sec-title">Public reviews. Independent checks. <em>Named references.</em></h2>
    <div class="sec-divider"></div>
    <p class="lead">The recommendation is supported by current public feedback, published accreditation and organisations that have trusted Painless with their own moves.</p>
  </div>

  <div class="sec" style="padding-top:7mm;">
    <div class="rev-row v2">
      <div class="rev-bubble"><div class="stars">★★★★★</div><div class="q">“We've just had <mark>the most stressful day of our lives made insanely easy</mark> by three absolute champions.”</div>
        <div class="rev-meta"><div class="mono">CN</div><div><div class="nm">Christopher Nelson</div><div class="src">Google review</div></div></div></div>
      <div class="rev-bubble"><div class="stars">★★★★★</div><div class="q">“The level of communication was fantastic. Everything was back in the right room, <mark>no fuss, no damage.</mark>”</div>
        <div class="rev-meta"><img src="rev-james.png" alt=""><div><div class="nm">James Collard</div><div class="src">Google review</div></div></div></div>
      <div class="rev-bubble"><div class="stars">★★★★★</div><div class="q">“They helped us move in Bristol and then cross-country, <mark>both on a tight timeline and at a good price.</mark>”</div>
        <div class="rev-meta"><img src="rev-laura.png" alt=""><div><div class="nm">Laura Carnegie-Brown</div><div class="src">Google review</div></div></div></div>
    </div>
  </div>

  <div class="sec" style="padding-top:6mm;">
    <div class="cred-band" style="margin-left:0; margin-right:0;">
      <div class="stat"><div class="big">122</div><div class="lbl2">verified reviews</div></div><div class="divider-v"></div>
      <div class="stat"><div class="big">4.9 / 5</div><div class="lbl2">current rating</div></div><div class="divider-v"></div>
      <div class="stat"><div class="big">Since 1978</div><div class="lbl2">serving Bristol</div></div><div class="divider-v"></div>
      <div class="stat"><div class="big">£15k</div><div class="lbl2">cover per van*</div></div>
    </div>
  </div>

  <div class="sec" style="padding-top:6mm;">
    <div class="proof-grid">
      <div class="proof-box"><div class="proof-logo"><img src="logo-move-assured.jpg" alt="Move Assured"></div><h3>Move Assured</h3><p>Accreditation for independent removers, covering insurance, terms and operating practice.</p></div>
      <div class="proof-box"><div class="proof-logo"><img src="logo-aim.jpg" alt="Association of Independent Movers"></div><h3>Association of Independent Movers</h3><p>Membership conditional on published standards of service and conduct.</p></div>
      <div class="proof-box"><div class="proof-logo"><img src="logo-compare-my-move.svg" alt="Compare My Move"></div><h3>Compare My Move</h3><p>Verified company status with identity, insurance and customer feedback checks.</p></div>
    </div>
  </div>

  <div class="sec" style="padding-top:6mm;">
    <div class="client-band" style="margin-left:0; margin-right:0; padding-top:4mm; padding-bottom:4mm;">
      <div class="cb-lbl" style="margin-bottom:3mm;">Organisations we have worked with</div>
      <div class="cb-row">
        <img src="client-bristol-old-vic.webp" alt="Bristol Old Vic">
        <img src="client-livewest.webp" alt="LiveWest">
        <img src="client-runway-east.svg" alt="Runway East">
        <img src="client-church-of-england.webp" alt="Church of England">
        <img src="client-second-step.webp" alt="Second Step">
      </div>
    </div>
  </div>

  <div class="footer"><div class="footer-left">Painless Removals Ltd &middot; Public proof and independent checks</div>
    <div class="footer-right"><a href="mailto:hello@painlessremovals.com">hello@painlessremovals.com</a><a class="phone-link" href="tel:+441172870082">0117 287 0082</a></div>
    <div class="footer-page">08 / 09</div></div>
</section>

<!-- ===================== PAGE 9 - TEAM AND NEXT STEP ===================== -->
<section class="page team-page">
  <div class="lockup">
    <div class="lockup-left"><img class="brand" src="logo.svg" alt="Painless Removals"><div class="strap">Making removals painless since 1978</div></div>
    <div class="lockup-right"><div class="for-label">Commercial and operational detail for</div>
      <div class="partner-name"><img class="brab-lockup" src="brabazon-logo-white.svg" alt="Brabazon"></div></div>
  </div>

  <div class="sec">
    <div class="sec-marker">Partnership contacts</div>
    <h2 class="sec-title">The people behind <em>the partnership.</em></h2>
    <div class="sec-divider"></div>
    <p class="lead">The Brabazon team and every referred buyer know who owns the relationship, who coordinates the move and where an issue is escalated.</p>
  </div>

  <div class="sec" style="padding-top:7mm;">
    <div class="team-grid">
      <div class="person"><div class="frame"><img src="jay.jpg" alt="Jay Newton"></div><div class="role">Director</div><h3>Jay Newton</h3>
        <p>Runs the Bristol operation day to day and is accountable for the service standards committed to Brabazon.</p></div>
      <div class="person"><div class="frame"><img src="tom.jpg" alt="Tom Mollett"></div><div class="role">Client relationships</div><h3>Tom Mollett</h3>
        <p>The first voice residents and concierge colleagues hear. Confirms dates, coordinates each move and fields changes.</p></div>
      <div class="person"><div class="frame"><img src="richard.jpg" alt="Richard Bailey"></div><div class="role">Partnerships lead</div><h3>Richard Bailey</h3>
        <p>Owns the YTL relationship from first working session through launch, review and ongoing improvement.</p></div>
    </div>
  </div>

  <div class="sec team-review">
    <div class="featured-review">
      <div class="stars">★★★★★</div>
      <div class="quote">“We had a nightmare of an exchange and completion. I could only confirm the moving date the evening before, which was very stressful, but <mark>Jay was so wonderfully adaptable.</mark> I couldn't have chosen a better removal company.”</div>
      <div class="rev-meta"><div class="review-avatar"><img src="rev-michelle-hayes.avif" alt="Michelle Hayes"></div><div><div class="nm">Michelle Hayes</div><div class="src">Trustpilot review</div></div></div>
    </div>
  </div>

  <div class="sec team-cta">
    <div class="next-steps" style="margin-left:0; margin-right:0;">
      <div><h3>Book the Brabazon working session.</h3>
        <p>Thirty minutes is enough to agree ownership, resident communications, the published rate card and what happens when a completion date changes.</p></div>
      <div class="cta"><div class="label">Partnership contact</div><div class="name">Richard - Partnerships</div>
        <a class="phone-link" href="tel:+447838159742">07838 159 742</a><div class="web"><a href="mailto:richard@painlessremovals.com">richard@painlessremovals.com</a></div></div>
    </div>
  </div>

  <div class="footer"><div class="footer-left">Painless Removals Ltd &middot; Independent and Bristol-based since 1978</div>
    <div class="footer-right"><a href="mailto:richard@painlessremovals.com">richard@painlessremovals.com</a><a class="phone-link" href="tel:+447838159742">07838 159 742</a></div>
    <div class="footer-page">09 / 09</div></div>
</section>

</body>
</html>
`;

const titleUpdated = source.replace(
  /<title>[\s\S]*?<\/title>/,
  "<title>Painless Removals - Commercial and operational detail for YTL - Brabazon - v2.2</title>\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
);

const styleEnd = titleUpdated.indexOf("</style>");
if (styleEnd === -1) throw new Error("Could not find closing style tag");

const bodyStart = titleUpdated.indexOf("<body");
if (bodyStart === -1) throw new Error("Could not find body tag");

const withCss = titleUpdated.slice(0, styleEnd) + v2Css + "\n" + titleUpdated.slice(styleEnd, bodyStart);
fs.writeFileSync(outputPath, withCss + body, "utf8");
console.log(outputPath);
