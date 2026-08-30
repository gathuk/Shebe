'use strict';

// ── State ────────────────────────────────────────────────────
let lastResult = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupForm();
  document.getElementById('newSearchBtn').addEventListener('click', resetToSearch);
  document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
});

function setupForm() {
  document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name  = document.getElementById('hybridName').value.trim();
    const email = document.getElementById('hybridEmail').value.trim();
    const phone = document.getElementById('hybridPhone').value.trim();
    if (!name && !email && !phone) {
      showError('Provide at least one of: name, email, or phone number');
      show('resultsSection');
      return;
    }
    await runSearch('hybrid', { name, email, phone });
  });
}

// ── Search ───────────────────────────────────────────────────
async function runSearch(type, fields) {
  showLoading();

  // Animate loader steps
  const steps = ['step1', 'step2', 'step3'];
  let si = 0;
  const stepInterval = setInterval(() => {
    if (si > 0) {
      document.getElementById(steps[si - 1]).classList.remove('active');
      document.getElementById(steps[si - 1]).classList.add('done');
      document.getElementById(steps[si - 1]).querySelector('i').className = 'fa-solid fa-check-circle';
    }
    if (si < steps.length) {
      document.getElementById(steps[si]).classList.add('active');
      si++;
    }
  }, 800);

  try {
    const resp = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...fields }),
    });

    clearInterval(stepInterval);
    const data = await resp.json();
    lastResult = data;

    if (data.error) {
      showError(data.error);
    } else {
      renderReport(data, type);
    }
  } catch (err) {
    clearInterval(stepInterval);
    showError('Network error — could not reach the server. Please try again.');
  }
}

// ── Loading / Reset ──────────────────────────────────────────
function showLoading() {
  hide('resultsSection');
  show('loadingState');
  // reset steps
  ['step1','step2','step3'].forEach((id, i) => {
    const el = document.getElementById(id);
    el.classList.remove('active', 'done');
    const icon = el.querySelector('i');
    icon.className = i === 0 ? 'fa-solid fa-check-circle' : i === 1 ? 'fa-solid fa-circle-notch fa-spin' : 'fa-regular fa-circle';
  });
  document.getElementById('step1').classList.add('active');
}

function resetToSearch() {
  hide('resultsSection');
  hide('loadingState');
  document.getElementById('hybridName').focus();
}

function showError(msg) {
  hide('loadingState');
  const el = document.getElementById('errorDisplay');
  el.innerHTML = `<i class="fa-solid fa-circle-xmark"></i><span>${esc(msg)}</span>`;
  el.classList.remove('hidden');
  document.getElementById('targetCard').innerHTML = '';
  document.getElementById('reportContent').innerHTML = '';
  show('resultsSection');
}

// ── Render ───────────────────────────────────────────────────
function renderReport(data, type) {
  hide('loadingState');

  const ts = data.meta?.generated_at
    ? new Date(data.meta.generated_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' })
    : '';
  document.getElementById('reportTimestamp').textContent = ts;
  document.getElementById('errorDisplay').classList.add('hidden');

  const targetCard = document.getElementById('targetCard');
  const content    = document.getElementById('reportContent');
  content.innerHTML = '';

  if (type === 'email')  renderEmail(data, targetCard, content);
  if (type === 'phone')  renderPhone(data, targetCard, content);
  if (type === 'name')   renderName(data, targetCard, content);
  if (type === 'hybrid') renderHybrid(data, targetCard, content);

  show('resultsSection');
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── WEB INTELLIGENCE CARD (shared) ───────────────────────────
function renderWebIntel(d, grid) {
  const wi = d.web_intel;
  if (!wi) return;

  const ddg  = wi.ddg  || {};
  const bing = wi.bing || {};

  // Nothing to show at all
  if (!ddg.found && !bing.configured && !bing.results?.length) return;

  let html = '';

  // DDG abstract / answer
  if (ddg.abstract) {
    html += `
      <div class="wi-abstract">
        <div class="wi-abstract-text">${esc(ddg.abstract)}</div>
        ${ddg.abstract_source ? `<div class="wi-source">
          <i class="fa-solid fa-circle-info"></i> Source:
          <a href="${esc(ddg.abstract_url || '#')}" target="_blank" rel="noopener">${esc(ddg.abstract_source)}</a>
        </div>` : ''}
      </div>`;
  }
  if (ddg.answer) {
    html += `<div class="wi-answer"><i class="fa-solid fa-bolt"></i> ${esc(ddg.answer)}</div>`;
  }

  // Infobox facts
  if (ddg.facts?.length) {
    html += `<div class="wi-facts">${ddg.facts.map(f =>
      `<div class="wi-fact-row"><span class="wi-fact-label">${esc(f.label)}</span><span class="wi-fact-value">${esc(f.value)}</span></div>`
    ).join('')}</div>`;
  }

  // Web results (Bing if key set, otherwise DuckDuckGo HTML scrape)
  if (bing.configured && bing.results?.length) {
    const sourceLabel = bing.source === 'ddg' ? 'DuckDuckGo' : 'Bing';
    const sourceIcon  = bing.source === 'ddg' ? 'fa-magnifying-glass' : 'fa-b';
    html += `<div class="wi-section-label"><i class="fa-solid ${sourceIcon}"></i> Web Results <span style="font-size:11px;color:var(--text3);font-weight:400">via ${sourceLabel}</span>${bing.total_estimated ? ` <span class="wi-count">~${Number(bing.total_estimated).toLocaleString()}</span>` : ''}</div>`;
    html += `<div class="wi-results">${bing.results.map(r => `
      <a href="${esc(r.url)}" target="_blank" rel="noopener" class="wi-result">
        <div class="wi-result-title">${esc(r.title)}</div>
        <div class="wi-result-url">${esc(r.display_url)}</div>
        <div class="wi-result-snippet">${esc(r.snippet)}</div>
        ${r.date ? `<div class="wi-result-date"><i class="fa-regular fa-calendar"></i> ${esc(r.date)}</div>` : ''}
      </a>`).join('')}</div>`;

    // Bing news (only present when Bing key is set)
    if (bing.news_results?.length) {
      html += `<div class="wi-section-label"><i class="fa-solid fa-newspaper"></i> News</div>`;
      html += `<div class="wi-results">${bing.news_results.map(n => `
        <a href="${esc(n.url)}" target="_blank" rel="noopener" class="wi-result">
          <div class="wi-result-title">${esc(n.title)}</div>
          ${n.provider ? `<div class="wi-result-url">${esc(n.provider)}${n.published ? ' · ' + esc(n.published) : ''}</div>` : ''}
          <div class="wi-result-snippet">${esc(n.description)}</div>
        </a>`).join('')}</div>`;
    }
  } else if (bing.configured && bing.error) {
    html += `<div class="no-data"><i class="fa-solid fa-xmark"></i> Web search: ${esc(String(bing.error))}</div>`;
  } else if (bing.configured && !bing.results?.length) {
    html += `<div class="no-data"><i class="fa-solid fa-circle-info"></i> No web results found for this query.</div>`;
  }

  // DDG related topics
  if (ddg.related_topics?.length) {
    html += `<div class="wi-section-label"><i class="fa-solid fa-link"></i> Related</div>`;
    html += `<div class="wi-related">${ddg.related_topics.map(t => `
      <a href="${esc(t.url)}" target="_blank" rel="noopener" class="wi-related-item">${esc(t.text)}</a>`
    ).join('')}</div>`;
  }

  if (!html) return;
  grid.appendChild(card('Web Intelligence', 'fa-globe', 'icon-teal', html));
}

// ── EMAIL RENDER ─────────────────────────────────────────────
function renderEmail(d, targetEl, grid) {
  // Avatar
  let avatarHtml = '';
  if (d.gravatar?.exists && d.gravatar?.avatar_url) {
    avatarHtml = `<img src="${esc(d.gravatar.avatar_url)}" class="target-avatar" alt="Gravatar" onerror="this.style.display='none'" />`;
  } else {
    avatarHtml = `<div class="target-avatar-placeholder"><i class="fa-solid fa-envelope"></i></div>`;
  }

  const tags = [
    d.is_disposable ? tag('Disposable Email', 'red') : '',
    d.provider ? tag(d.provider, 'blue') : '',
    d.is_corporate ? tag('Corporate/Custom Domain', 'purple') : '',
    d.valid ? tag('Valid Format', 'green') : tag('Invalid Format', 'red'),
  ].filter(Boolean).join('');

  targetEl.innerHTML = `
    ${avatarHtml}
    <div class="target-info">
      <div class="target-label">Email Address</div>
      <div class="target-name">${esc(d.target)}</div>
      <div class="target-tags">${tags}</div>
      ${d.username_notes?.length ? `<div style="margin-top:8px">${d.username_notes.map(n => `<span style="font-size:12px;color:var(--yellow)"><i class="fa-solid fa-lightbulb"></i> ${esc(n)}</span>`).join('<br/>')}</div>` : ''}
    </div>
    <div class="target-status">
      <div class="status-pill ${d.valid ? 'valid' : 'invalid'}">
        <i class="fa-solid fa-${d.valid ? 'circle-check' : 'circle-xmark'}"></i>
        ${d.valid ? 'Valid' : 'Invalid'}
      </div>
    </div>`;

  renderWebIntel(d, grid);

  // --- Identity Info card
  const identRows = [
    row('Username', d.username),
    row('Domain', d.domain),
    row('Provider', d.provider || (d.is_disposable ? 'Disposable' : 'Custom/Corporate')),
    row('Disposable?', d.is_disposable ? '⚠ Yes — temporary address' : 'No'),
  ];
  grid.appendChild(card('Identity Info', 'fa-id-card', 'icon-blue', identRows.join('')));

  // --- Gravatar
  let gravatarContent = '';
  const g = d.gravatar;
  if (g) {
    if (g.exists === null) {
      gravatarContent = `<div class="no-data"><i class="fa-solid fa-wifi"></i>Could not check Gravatar (network error)</div>`;
    } else if (g.exists) {
      gravatarContent = `
        <div class="gravatar-preview">
          <img src="${esc(g.avatar_url)}" class="gravatar-img" alt="Gravatar" />
          <div class="gravatar-info">
            <div class="gravatar-label">Gravatar Profile Found</div>
            <div class="gravatar-found"><i class="fa-solid fa-circle-check"></i> Profile exists</div>
            <div style="margin-top:6px">
              <a href="${esc(g.profile_url)}" target="_blank" rel="noopener" class="link-item" style="display:inline-flex">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> View Profile
              </a>
            </div>
          </div>
        </div>`;
    } else {
      gravatarContent = `
        <div class="gravatar-preview">
          <div class="target-avatar-placeholder" style="width:56px;height:56px;font-size:22px"><i class="fa-regular fa-user"></i></div>
          <div class="gravatar-info">
            <div class="gravatar-label">MD5: <code>${esc(g.hash)}</code></div>
            <div class="gravatar-not-found"><i class="fa-solid fa-circle-xmark"></i> No Gravatar profile found</div>
          </div>
        </div>`;
    }
  }
  grid.appendChild(card('Gravatar Profile', 'fa-user-circle', 'icon-purple', gravatarContent));

  // --- Data Breaches
  const breach = d.breach_data;
  let breachContent = '';
  if (!breach?.configured) {
    breachContent = `<div class="no-data">
      <i class="fa-solid fa-key"></i>
      HaveIBeenPwned check requires an API key.<br/>
      <small>Set <code>HIBP_API_KEY</code> environment variable.</small>
    </div>`;
  } else if (breach.error) {
    breachContent = `<div class="no-data"><i class="fa-solid fa-wifi"></i>${esc(breach.error)}</div>`;
  } else if (!breach.breached) {
    breachContent = `
      <div style="text-align:center;padding:16px">
        <i class="fa-solid fa-shield-halved" style="font-size:32px;color:var(--green);display:block;margin-bottom:10px"></i>
        <div style="font-weight:600;color:var(--green)">No breaches found</div>
        <div style="font-size:13px;color:var(--text3);margin-top:4px">This email has not appeared in known data breaches.</div>
      </div>`;
  } else {
    breachContent = `
      <div style="margin-bottom:12px;font-size:13px;color:var(--red);font-weight:600">
        <i class="fa-solid fa-triangle-exclamation"></i> Found in ${breach.count} breach${breach.count !== 1 ? 'es' : ''}
      </div>
      <div class="breach-list">
        ${breach.breaches.map(b => `
          <div class="breach-item">
            <div class="breach-name"><i class="fa-solid fa-database"></i> ${esc(b.name)}</div>
            <div class="breach-date">Date: ${esc(b.date)}</div>
            ${b.data_classes?.length ? `<div class="breach-types">${b.data_classes.map(t => `<span class="breach-type-tag">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>`).join('')}
      </div>`;
  }
  grid.appendChild(card('Data Breach Check', 'fa-shield-halved', 'icon-red', breachContent));

  // --- Email Reputation (EmailRep.io)
  const er = d.email_rep;
  let erContent = '';
  if (!er || er.error) {
    erContent = `<div class="no-data"><i class="fa-solid fa-wifi"></i>${er?.error ? esc(String(er.error)) : 'EmailRep unavailable (10 req/day limit)'}</div>`;
  } else {
    const repColor = er.reputation === 'high' ? 'var(--green)' : er.reputation === 'medium' ? 'var(--yellow)' : 'var(--red)';
    const repIcon  = er.reputation === 'high' ? 'fa-circle-check' : er.reputation === 'medium' ? 'fa-circle-exclamation' : 'fa-circle-xmark';
    const profiles = Array.isArray(er.profiles) ? er.profiles : [];
    erContent = `
      <div class="er-reputation">
        <i class="fa-solid ${repIcon}" style="color:${repColor};font-size:28px;flex-shrink:0"></i>
        <div>
          <div style="font-weight:700;color:${repColor};text-transform:capitalize;font-size:15px">${esc(String(er.reputation || 'Unknown'))} Reputation</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">${er.suspicious ? '⚠ Suspicious activity detected' : 'No suspicious activity flagged'}</div>
        </div>
      </div>
      ${er.references != null ? row('References Found', `${er.references}`) : ''}
      ${profiles.length ? `<div class="data-row"><span class="data-label">Linked Profiles</span><span class="data-value" style="flex-wrap:wrap;gap:4px;display:flex">${profiles.map(p => `<span class="breach-type-tag">${esc(String(p))}</span>`).join('')}</span></div>` : ''}
      ${er.first_seen ? row('First Seen', String(er.first_seen)) : ''}
      ${er.last_seen  ? row('Last Seen',  String(er.last_seen))  : ''}
      ${er.data_breach         === true ? `<div class="data-row"><span class="data-label" style="color:var(--red)">⚠ Data Breach</span><span class="data-value">Seen in breach datasets</span></div>` : ''}
      ${er.credentials_leaked  === true ? `<div class="data-row"><span class="data-label" style="color:var(--red)">⚠ Credentials Leaked</span><span class="data-value">Passwords have been exposed</span></div>` : ''}
      ${er.malicious_activity  === true ? `<div class="data-row"><span class="data-label" style="color:var(--red)">⚠ Malicious Activity</span><span class="data-value">Associated with malicious use</span></div>` : ''}
      ${er.spam         === true ? row('Spam',       'Associated with spam') : ''}
      ${er.blacklisted  === true ? row('Blacklisted', 'Email is blacklisted') : ''}
      ${er.deliverable  != null  ? row('Deliverable', er.deliverable ? '✓ Yes' : '✗ No') : ''}
      <div style="font-size:11px;color:var(--text3);margin-top:10px"><i class="fa-solid fa-circle-info"></i> Source: emailrep.io (free, 10 req/day)</div>`;
  }
  grid.appendChild(card('Email Reputation', 'fa-chart-bar', 'icon-teal', erContent));

  // --- MX Records
  const mx = d.mx_records;
  let mxContent = '';
  if (mx?.error) {
    mxContent = `<div class="no-data"><i class="fa-solid fa-xmark"></i>${esc(mx.error)}</div>`;
  } else if (mx?.records?.length) {
    mxContent = mx.records.map(r =>
      `<div class="data-row"><span class="data-label">Priority ${r.priority}</span><span class="data-value">${esc(r.exchange)}</span></div>`
    ).join('');
  } else {
    mxContent = `<div class="no-data"><i class="fa-solid fa-inbox"></i>${mx?.note || 'No MX records found'}</div>`;
  }

  // Add TXT/SPF
  const txt = d.txt_records || {};
  if (txt.spf) mxContent += `<div class="data-row"><span class="data-label">SPF</span><span class="data-value" style="font-size:11px">${esc(txt.spf)}</span></div>`;
  if (txt.dmarc) mxContent += `<div class="data-row"><span class="data-label">DMARC</span><span class="data-value" style="font-size:11px">${esc(txt.dmarc)}</span></div>`;

  grid.appendChild(card('DNS / Mail Records', 'fa-server', 'icon-teal', mxContent));

  // --- WHOIS
  const w = d.whois;
  let whoisContent = '';
  if (w?.error) {
    whoisContent = `<div class="no-data"><i class="fa-solid fa-xmark"></i>${esc(w.error)}</div>`;
  } else if (w?.note) {
    whoisContent = `<div class="no-data"><i class="fa-solid fa-info-circle"></i>${esc(w.note)}</div>`;
  } else if (w) {
    const wrows = [
      w.registrar     ? row('Registrar', w.registrar) : '',
      w.organization  ? row('Organization', w.organization) : '',
      w.country       ? row('Country', w.country) : '',
      w.creation_date ? row('Created', w.creation_date) : '',
      w.expiration_date ? row('Expires', w.expiration_date) : '',
      w.updated_date  ? row('Updated', w.updated_date) : '',
    ].filter(Boolean).join('');
    whoisContent = wrows || `<div class="no-data"><i class="fa-solid fa-info-circle"></i>No WHOIS data available</div>`;
    if (w.name_servers?.length) {
      whoisContent += `<div class="data-row"><span class="data-label">Nameservers</span><span class="data-value">${w.name_servers.map(esc).join('<br/>')}</span></div>`;
    }
  } else {
    whoisContent = `<div class="no-data"><i class="fa-solid fa-info-circle"></i>No WHOIS data</div>`;
  }
  grid.appendChild(card('Domain WHOIS', 'fa-globe', 'icon-blue', whoisContent));

  // --- Further Research (collapsible)
  const researchCard = furtherResearch([
    d.username_profile_links ? { title: `Profiles for @${d.username}`, links: d.username_profile_links } : null,
    d.search_links ? { title: 'Search & Investigation', links: d.search_links } : null,
  ].filter(Boolean));
  if (researchCard) grid.appendChild(researchCard);
}

// ── PHONE RENDER ─────────────────────────────────────────────
function renderPhone(d, targetEl, grid) {
  const avatarHtml = `<div class="target-avatar-placeholder"><i class="fa-solid fa-phone"></i></div>`;
  const tags = [
    d.partial ? tag('Partial Number', 'yellow') : (d.valid ? tag('Valid Number', 'green') : tag('Invalid Number', 'red')),
    d.line_type && d.line_type !== 'Unknown (partial number)' ? tag(d.line_type, 'blue') : '',
    d.country_name ? tag(d.country_name, 'purple') : '',
  ].filter(Boolean).join('');

  const statusPillClass = d.partial ? 'partial' : (d.valid ? 'valid' : 'invalid');
  const statusIcon = d.partial ? 'fa-circle-question' : (d.valid ? 'fa-circle-check' : 'fa-circle-xmark');
  const statusLabel = d.partial ? 'Partial' : (d.valid ? 'Valid' : 'Invalid');

  targetEl.innerHTML = `
    ${avatarHtml}
    <div class="target-info">
      <div class="target-label">Phone Number${d.partial ? ' — Wildcard Search' : ''}</div>
      <div class="target-name">${esc(d.formats?.International || d.target)}</div>
      <div class="target-tags">${tags}</div>
    </div>
    <div class="target-status">
      <div class="status-pill ${statusPillClass}">
        <i class="fa-solid ${statusIcon}"></i>
        ${statusLabel}
      </div>
    </div>`;

  if (d.error) {
    grid.appendChild(errorBlock(d.error));
    return;
  }

  renderWebIntel(d, grid);

  // Number Details
  const detailRows = [
    d.partial ? row('Number Pattern', d.formats?.['Input Pattern'] || d.target) : '',
    d.partial ? row('Known Digits', d.formats?.['Known Digits'] || '') : '',
    row('Country', `${d.country_name || ''} (${d.region_code || ''})`),
    row('Dial Code', d.country_code),
    !d.partial ? row('National #', d.national_number) : row('National Pattern', d.formats?.['National Pattern'] || d.national_number),
    row('Location', d.location),
    row('Carrier', d.carrier),
    !d.partial ? row('Line Type', d.line_type) : '',
    d.timezones?.length ? row('Timezone(s)', d.timezones.join(', ')) : '',
    !d.partial ? row('Valid', d.valid ? '✓ Yes' : '✗ No') : '',
    !d.partial ? (d.possible != null ? row('Possible', d.possible ? '✓ Yes' : '✗ No') : '') : '',
  ].filter(Boolean).join('');
  grid.appendChild(card('Number Details', 'fa-circle-info', 'icon-blue', detailRows));

  // Reverse Lookup — Caller ID
  const rev = d.reverse_lookup ?? {};
  const nv  = d.numverify ?? {};
  let revContent = '';

  if (!rev.configured && !nv.configured) {
    revContent = `<div class="no-data">
      <i class="fa-solid fa-key"></i>
      Caller name lookup requires API credentials.<br/>
      <small>Set <code>TWILIO_ACCOUNT_SID</code> + <code>TWILIO_AUTH_TOKEN</code> for caller ID (CNAM),
      or <code>NUMVERIFY_API_KEY</code> for carrier enrichment.</small>
    </div>`;
  } else {
    const rows = [];

    if (rev.configured) {
      if (rev.error) {
        rows.push(`<div class="no-data" style="margin-bottom:8px"><i class="fa-solid fa-xmark"></i> Twilio: ${esc(String(rev.error))}</div>`);
      } else if (rev.caller_name) {
        rows.push(row('Caller Name', String(rev.caller_name)));
        const callerTypeLabel = rev.caller_type === 'CONSUMER' ? 'Consumer (individual)'
          : rev.caller_type === 'BUSINESS' ? 'Business'
          : rev.caller_type ? String(rev.caller_type) : null;
        if (callerTypeLabel) rows.push(row('Name Type', callerTypeLabel));
        if (rev.carrier_name) rows.push(row('Carrier (live)', String(rev.carrier_name)));
        if (rev.line_type)    rows.push(row('Line Type (live)', String(rev.line_type)));
        if (rev.mobile_country_code) rows.push(row('MCC', String(rev.mobile_country_code)));
        if (rev.mobile_network_code) rows.push(row('MNC', String(rev.mobile_network_code)));
      } else {
        rows.push(`<div class="no-data" style="margin-bottom:8px"><i class="fa-solid fa-circle-info"></i> No CNAM record found — number may be unlisted or too new.</div>`);
        if (rev.carrier_name) rows.push(row('Carrier (live)', String(rev.carrier_name)));
        if (rev.line_type)    rows.push(row('Line Type (live)', String(rev.line_type)));
      }
    }

    if (nv.configured) {
      if (nv.error) {
        rows.push(`<div class="no-data"><i class="fa-solid fa-xmark"></i> NumVerify: ${esc(String(nv.error))}</div>`);
      } else {
        if (nv.location)  rows.push(row('Location (NumVerify)', String(nv.location)));
        if (nv.carrier)   rows.push(row('Carrier (NumVerify)', String(nv.carrier)));
        if (nv.line_type) rows.push(row('Line Type (NumVerify)', String(nv.line_type)));
      }
    }

    revContent = rows.join('') || `<div class="no-data"><i class="fa-solid fa-circle-info"></i>No additional lookup data returned.</div>`;
  }
  grid.appendChild(card('Reverse Lookup — Caller ID', 'fa-address-card', 'icon-teal', revContent));

  // Kenya Phone Mentions (only shown for +254 numbers)
  const kp = d.kenya_phone_mentions;
  if (kp?.results?.length) {
    const kpHtml = `<div class="wi-results">${kp.results.map(r => `
      <a href="${esc(r.url)}" target="_blank" rel="noopener" class="wi-result">
        <div class="wi-result-title">${esc(r.title)}</div>
        <div class="wi-result-url">${esc(r.display_url)}</div>
        ${r.snippet ? `<div class="wi-result-snippet">${esc(r.snippet)}</div>` : ''}
      </a>`).join('')}</div>`;
    grid.appendChild(card(`Kenya Public Mentions (${kp.results.length})`, 'fa-earth-africa', 'icon-green', kpHtml));
  }

  // Formats
  if (d.formats) {
    const fmtRows = Object.entries(d.formats).map(([k, v]) => row(k, v)).join('');
    grid.appendChild(card('Number Formats', 'fa-code', 'icon-green', fmtRows));
  }

  // Notes
  if (d.notes?.length) {
    const notesHtml = `<div class="note-list">${d.notes.map(n =>
      `<div class="note-item"><i class="fa-solid fa-triangle-exclamation"></i>${esc(n)}</div>`
    ).join('')}</div>`;
    grid.appendChild(card('Analysis Notes', 'fa-lightbulb', 'icon-yellow', notesHtml));
  }

  // Communication links
  if (d.communication_links) {
    grid.appendChild(card('Communication Links', 'fa-comments', 'icon-purple', buildLinkList(d.communication_links)));
  }

  // --- Further Research (collapsible)
  const phoneResearchCard = furtherResearch([
    d.search_links ? { title: 'Search & Lookup Links', links: d.search_links } : null,
  ].filter(Boolean));
  if (phoneResearchCard) grid.appendChild(phoneResearchCard);
}

// ── NAME RENDER ──────────────────────────────────────────────
function renderName(d, targetEl, grid) {
  if (d.error) {
    targetEl.innerHTML = `<div class="target-avatar-placeholder"><i class="fa-solid fa-user"></i></div>
      <div class="target-info"><div class="target-label">Name</div><div class="target-name">${esc(d.target || '')}</div></div>`;
    grid.appendChild(errorBlock(d.error));
    return;
  }

  const parts = d.name_parts || {};

  // Find best GitHub avatar
  const foundGH = (d.github_profiles || []).find(p => p.found && p.avatar);
  const avatarHtml = foundGH
    ? `<img src="${esc(foundGH.avatar)}" class="target-avatar" alt="GitHub Avatar" />`
    : `<div class="target-avatar-placeholder"><i class="fa-solid fa-user"></i></div>`;

  const tags = [
    parts.first ? tag(`First: ${parts.first}`, 'blue') : '',
    parts.last  ? tag(`Last: ${parts.last}`, 'blue') : '',
    parts.middle ? tag(`Middle: ${parts.middle}`, 'purple') : '',
    d.github_found_count > 0 ? tag(`${d.github_found_count} GitHub match${d.github_found_count !== 1 ? 'es' : ''}`, 'green') : '',
  ].filter(Boolean).join('');

  targetEl.innerHTML = `
    ${avatarHtml}
    <div class="target-info">
      <div class="target-label">Full Name</div>
      <div class="target-name">${esc(d.target)}</div>
      <div class="target-tags">${tags}</div>
    </div>`;

  renderWebIntel(d, grid);

  // Key findings summary
  const kf = d.key_findings || {};
  if (Object.keys(kf).length) {
    const items = [
      kf.github_found > 0
        ? `<div class="finding-row found"><i class="fa-brands fa-github"></i> ${kf.github_found} GitHub profile${kf.github_found !== 1 ? 's' : ''} matched</div>`
        : `<div class="finding-row"><i class="fa-brands fa-github"></i> No GitHub profiles found</div>`,
      kf.reddit_found > 0
        ? `<div class="finding-row found"><i class="fa-brands fa-reddit"></i> ${kf.reddit_found} Reddit account${kf.reddit_found !== 1 ? 's' : ''} found</div>`
        : `<div class="finding-row"><i class="fa-brands fa-reddit"></i> No Reddit accounts found</div>`,
      kf.keybase_found > 0
        ? `<div class="finding-row found"><i class="fa-solid fa-key"></i> ${kf.keybase_found} Keybase profile${kf.keybase_found !== 1 ? 's' : ''} found</div>`
        : `<div class="finding-row"><i class="fa-solid fa-key"></i> No Keybase profiles found</div>`,
      kf.devto_found > 0
        ? `<div class="finding-row found"><i class="fa-brands fa-dev"></i> ${kf.devto_found} DEV.to profile${kf.devto_found !== 1 ? 's' : ''} found</div>`
        : `<div class="finding-row"><i class="fa-brands fa-dev"></i> No DEV.to profiles found</div>`,
      kf.mastodon_found > 0
        ? `<div class="finding-row found"><i class="fa-brands fa-mastodon"></i> ${kf.mastodon_found} Mastodon account${kf.mastodon_found !== 1 ? 's' : ''} found</div>`
        : `<div class="finding-row"><i class="fa-brands fa-mastodon"></i> No Mastodon accounts found</div>`,
      kf.wikipedia_hits > 0
        ? `<div class="finding-row found"><i class="fa-brands fa-wikipedia-w"></i> ${kf.wikipedia_hits} Wikipedia result${kf.wikipedia_hits !== 1 ? 's' : ''}</div>`
        : `<div class="finding-row"><i class="fa-brands fa-wikipedia-w"></i> Not found on Wikipedia</div>`,
      `<div class="finding-row"><i class="fa-solid fa-at"></i> ${kf.usernames_checked} username patterns checked across platforms</div>`,
    ].join('');
    grid.appendChild(card('Intelligence Summary', 'fa-bullseye', 'icon-orange', `<div class="finding-list">${items}</div>`));
  }

  // Name breakdown
  const nameRows = [
    row('Full Name', parts.full),
    parts.first  ? row('First Name', parts.first) : '',
    parts.middle ? row('Middle Name', parts.middle) : '',
    parts.last   ? row('Last Name', parts.last) : '',
  ].filter(Boolean).join('');
  grid.appendChild(card('Name Breakdown', 'fa-id-badge', 'icon-blue', nameRows));

  // --- Name Demographics (genderize / agify / nationalize)
  const na = d.name_analysis;
  if (na && (na.gender || na.age || (na.nationalities && na.nationalities.length > 0))) {
    let naContent = '';
    if (na.gender) {
      const gIcon  = na.gender.gender === 'male' ? 'fa-mars' : 'fa-venus';
      const gColor = na.gender.gender === 'male' ? 'var(--blue)' : 'var(--purple)';
      naContent += `<div class="data-row">
        <span class="data-label">Predicted Gender</span>
        <span class="data-value"><i class="fa-solid ${gIcon}" style="color:${gColor}"></i>
          ${esc(na.gender.gender.charAt(0).toUpperCase() + na.gender.gender.slice(1))}
          <span style="color:var(--text3);font-size:12px"> (${na.gender.probability}% confidence, n=${Number(na.gender.sample_size || 0).toLocaleString()})</span>
        </span></div>`;
    }
    if (na.age) {
      naContent += `<div class="data-row">
        <span class="data-label">Predicted Age</span>
        <span class="data-value">~${na.age.predicted_age} years
          <span style="color:var(--text3);font-size:12px"> (based on ${Number(na.age.sample_size || 0).toLocaleString()} records)</span>
        </span></div>`;
    }
    if (na.nationalities && na.nationalities.length) {
      naContent += `<div class="wi-section-label" style="margin-top:10px"><i class="fa-solid fa-earth-africa"></i> Name Origin Probability</div>`;
      naContent += na.nationalities.map(n => `
        <div class="nat-row">
          <span class="nat-name">${esc(n.name)}</span>
          <div class="nat-bar-wrap"><div class="nat-bar" style="width:${Math.max(n.probability, 2)}%"></div></div>
          <span class="nat-pct">${n.probability}%</span>
        </div>`).join('');
    }
    naContent += `<div style="font-size:11px;color:var(--text3);margin-top:10px"><i class="fa-solid fa-circle-info"></i> Statistical predictions from global name databases (genderize.io / agify.io / nationalize.io).</div>`;
    grid.appendChild(card('Name Demographics', 'fa-chart-pie', 'icon-orange', naContent));
  }

  // GitHub profiles found
  const ghProfiles = (d.github_profiles || []).filter(p => p.found);
  let ghContent = '';
  if (ghProfiles.length === 0) {
    ghContent = `<div class="no-data"><i class="fa-brands fa-github"></i>No GitHub profiles found for generated usernames</div>`;
  } else {
    ghContent = ghProfiles.map(p => `
      <a href="${esc(p.url)}" target="_blank" rel="noopener" class="github-profile">
        <img src="${esc(p.avatar)}" class="github-avatar" alt="${esc(p.username)}" />
        <div class="github-info">
          <div class="github-username">@${esc(p.username)}</div>
          ${p.name ? `<div class="github-name">${esc(p.name)}</div>` : ''}
          ${p.bio  ? `<div class="github-bio">${esc(p.bio)}</div>` : ''}
          ${p.location ? `<div class="github-bio"><i class="fa-solid fa-location-dot"></i> ${esc(p.location)}</div>` : ''}
          <div class="github-stats">
            ${p.public_repos != null ? `<span class="github-stat"><i class="fa-solid fa-book"></i>${p.public_repos} repos</span>` : ''}
            ${p.followers    != null ? `<span class="github-stat"><i class="fa-solid fa-users"></i>${p.followers} followers</span>` : ''}
            ${p.email  ? `<span class="github-stat"><i class="fa-solid fa-envelope"></i>${esc(p.email)}</span>` : ''}
            ${p.twitter ? `<span class="github-stat"><i class="fa-brands fa-twitter"></i>@${esc(p.twitter)}</span>` : ''}
          </div>
        </div>
        <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text3);font-size:12px"></i>
      </a>`).join('');
  }
  grid.appendChild(card(`GitHub Profiles (${ghProfiles.length} found)`, 'fa-brands fa-github', 'icon-green', ghContent));

  // Reddit profiles
  const rdProfiles = (d.reddit_profiles || []).filter(p => p.found);
  let rdContent = rdProfiles.length === 0
    ? `<div class="no-data"><i class="fa-brands fa-reddit"></i>No matching Reddit accounts found for generated usernames</div>`
    : rdProfiles.map(p => `
      <a href="${esc(p.url)}" target="_blank" rel="noopener" class="github-profile">
        <div class="target-avatar-placeholder" style="width:40px;height:40px;font-size:18px;flex-shrink:0"><i class="fa-brands fa-reddit"></i></div>
        <div class="github-info">
          <div class="github-username">u/${esc(p.username)}</div>
          <div class="github-stats">
            ${p.karma != null ? `<span class="github-stat"><i class="fa-solid fa-arrow-up"></i> ${Number(p.karma).toLocaleString()} karma</span>` : ''}
            ${p.is_gold ? `<span class="github-stat"><i class="fa-solid fa-star"></i> Gold</span>` : ''}
          </div>
        </div>
        <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text3);font-size:12px;margin-left:auto"></i>
      </a>`).join('');
  grid.appendChild(card(`Reddit Accounts (${rdProfiles.length} found)`, 'fa-brands fa-reddit', 'icon-red', rdContent));

  // Keybase profiles
  const kbProfiles = (d.keybase_profiles || []).filter(p => p.found);
  if (kbProfiles.length > 0) {
    const kbHtml = kbProfiles.map(p => `
      <a href="${esc(p.url)}" target="_blank" rel="noopener" class="github-profile">
        <div class="target-avatar-placeholder" style="width:40px;height:40px;font-size:18px;flex-shrink:0"><i class="fa-solid fa-key"></i></div>
        <div class="github-info">
          <div class="github-username">${esc(p.display_name || p.username)}</div>
          ${p.full_name ? `<div class="github-name">${esc(p.full_name)}</div>` : ''}
          ${p.bio  ? `<div class="github-bio">${esc(p.bio)}</div>` : ''}
          ${p.location ? `<div class="github-bio"><i class="fa-solid fa-location-dot"></i> ${esc(p.location)}</div>` : ''}
        </div>
        <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text3);font-size:12px;margin-left:auto"></i>
      </a>`).join('');
    grid.appendChild(card(`Keybase Profiles (${kbProfiles.length} found)`, 'fa-solid fa-key', 'icon-purple', kbHtml));
  }

  // DEV.to profiles
  const devtoProfiles = (d.devto_profiles || []).filter(p => p.found);
  let devtoContent = devtoProfiles.length === 0
    ? `<div class="no-data"><i class="fa-brands fa-dev"></i>No matching DEV.to profiles found for generated usernames</div>`
    : devtoProfiles.map(p => `
      <a href="${esc(p.url)}" target="_blank" rel="noopener" class="github-profile">
        ${p.profile_image
          ? `<img src="${esc(p.profile_image)}" class="github-avatar" alt="${esc(p.username)}" />`
          : `<div class="target-avatar-placeholder" style="width:40px;height:40px;font-size:18px;flex-shrink:0"><i class="fa-brands fa-dev"></i></div>`}
        <div class="github-info">
          <div class="github-username">${esc(p.name || p.username)}</div>
          ${p.summary ? `<div class="github-bio">${esc(p.summary)}</div>` : ''}
          ${p.location ? `<div class="github-bio"><i class="fa-solid fa-location-dot"></i> ${esc(p.location)}</div>` : ''}
          <div class="github-stats">
            ${p.github_username ? `<span class="github-stat"><i class="fa-brands fa-github"></i> ${esc(p.github_username)}</span>` : ''}
            ${p.twitter_username ? `<span class="github-stat"><i class="fa-brands fa-x-twitter"></i> @${esc(p.twitter_username)}</span>` : ''}
            ${p.website_url ? `<span class="github-stat"><i class="fa-solid fa-link"></i> ${esc(p.website_url)}</span>` : ''}
          </div>
        </div>
        <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text3);font-size:12px;margin-left:auto"></i>
      </a>`).join('');
  grid.appendChild(card(`DEV.to Profiles (${devtoProfiles.length} found)`, 'fa-brands fa-dev', 'icon-purple', devtoContent));

  // Mastodon accounts
  const mastodonAccounts = (d.mastodon_accounts || []).filter(a => a.found);
  let mastodonContent = mastodonAccounts.length === 0
    ? `<div class="no-data"><i class="fa-brands fa-mastodon"></i>No Mastodon accounts found matching the search query</div>`
    : mastodonAccounts.map(a => `
      <a href="${esc(a.url)}" target="_blank" rel="noopener" class="github-profile">
        ${a.avatar
          ? `<img src="${esc(a.avatar)}" class="github-avatar" alt="${esc(a.username)}" />`
          : `<div class="target-avatar-placeholder" style="width:40px;height:40px;font-size:18px;flex-shrink:0"><i class="fa-brands fa-mastodon"></i></div>`}
        <div class="github-info">
          <div class="github-username">@${esc(a.username)}</div>
          ${a.display_name ? `<div class="github-name">${esc(a.display_name)}</div>` : ''}
          ${a.bio ? `<div class="github-bio">${esc(a.bio)}</div>` : ''}
          <div class="github-stats">
            ${a.followers != null ? `<span class="github-stat"><i class="fa-solid fa-users"></i> ${Number(a.followers).toLocaleString()} followers</span>` : ''}
            ${a.statuses != null ? `<span class="github-stat"><i class="fa-solid fa-comment"></i> ${Number(a.statuses).toLocaleString()} posts</span>` : ''}
          </div>
        </div>
        <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text3);font-size:12px;margin-left:auto"></i>
      </a>`).join('');
  grid.appendChild(card(`Mastodon Accounts (${mastodonAccounts.length} found)`, 'fa-brands fa-mastodon', 'icon-teal', mastodonContent));

  // Wikipedia results
  const wikiResults = d.wikipedia?.results || [];
  if (wikiResults.length > 0) {
    const wikiHtml = `<div class="link-list">${wikiResults.map(r => `
      <a href="${esc(r.url)}" target="_blank" rel="noopener" class="link-item wiki-link">
        <i class="fa-brands fa-wikipedia-w"></i>
        <div style="flex:1;min-width:0">
          <div class="link-label" style="font-weight:600">${esc(r.title)}</div>
          ${r.snippet ? `<div style="font-size:12px;color:var(--text2);margin-top:2px">${esc(r.snippet)}…</div>` : ''}
        </div>
        <i class="fa-solid fa-arrow-up-right-from-square link-ext" style="flex-shrink:0"></i>
      </a>`).join('')}</div>`;
    grid.appendChild(card('Wikipedia Results', 'fa-brands fa-wikipedia-w', 'icon-blue', wikiHtml));
  }

  // Kenya News Mentions
  const kn = d.kenya_intel?.news;
  if (kn?.results?.length) {
    const kNewsHtml = `<div class="wi-results">${kn.results.map(r => `
      <a href="${esc(r.url)}" target="_blank" rel="noopener" class="wi-result">
        <div class="wi-result-title">${esc(r.title)}</div>
        <div class="wi-result-url">${esc(r.display_url)}</div>
        ${r.snippet ? `<div class="wi-result-snippet">${esc(r.snippet)}</div>` : ''}
      </a>`).join('')}</div>`;
    grid.appendChild(card(`Kenya News Mentions (${kn.results.length})`, 'fa-newspaper', 'icon-red', kNewsHtml));
  }

  // Kenya Social Media & Directories
  const kd = d.kenya_intel?.social_dirs;
  if (kd?.results?.length) {
    const kDirHtml = `<div class="wi-results">${kd.results.map(r => `
      <a href="${esc(r.url)}" target="_blank" rel="noopener" class="wi-result">
        <div class="wi-result-title">${esc(r.title)}</div>
        <div class="wi-result-url">${esc(r.display_url)}</div>
        ${r.snippet ? `<div class="wi-result-snippet">${esc(r.snippet)}</div>` : ''}
      </a>`).join('')}</div>`;
    grid.appendChild(card(`Kenya Social & Directories (${kd.results.length})`, 'fa-earth-africa', 'icon-green', kDirHtml));
  }

  // Possible usernames
  const usernames = d.possible_usernames || [];
  if (usernames.length) {
    const unHtml = `<div class="username-grid">${usernames.map(u =>
      `<div class="username-item">@${esc(u)}</div>`
    ).join('')}</div>`;
    grid.appendChild(card('Generated Usernames', 'fa-at', 'icon-purple', unHtml));
  }

  // --- Further Research (collapsible)
  const profileLinks = d.username_profile_links || {};
  const flatProfileLinks = {};
  for (const [un, links] of Object.entries(profileLinks).slice(0, 5)) {
    for (const [platform, url] of Object.entries(links)) {
      flatProfileLinks[`${platform} (@${un})`] = url;
    }
  }
  const nameResearchCard = furtherResearch([
    Object.keys(flatProfileLinks).length ? { title: 'Profile Links by Username', links: flatProfileLinks } : null,
    d.search_links  ? { title: 'Search Platforms', links: d.search_links  } : null,
    d.google_dorks  ? { title: 'Google Dorks',     links: d.google_dorks  } : null,
  ].filter(Boolean));
  if (nameResearchCard) grid.appendChild(nameResearchCard);
}

// ── HYBRID RENDER ────────────────────────────────────────────
function renderHybrid(d, targetEl, grid) {
  if (d.error) {
    targetEl.innerHTML = `<div class="target-avatar-placeholder"><i class="fa-solid fa-user-secret"></i></div>
      <div class="target-info"><div class="target-label">Intelligence Report</div><div class="target-name">—</div></div>`;
    grid.appendChild(errorBlock(d.error));
    return;
  }
  renderOsintDoc(d, targetEl, grid);
}

function renderOsintDoc(d, targetEl, grid) {
  const t  = d.target || {};
  const nm = d.name   || {};
  const em = d.email  || {};
  const ph = d.phone  || {};
  const cr = d.cross_reference || {};

  // ── Target header ─────────────────────────────────────────
  const foundGH = (nm.github_profiles || []).find(p => p.found && p.avatar);
  const avatarHtml = em.gravatar?.exists && em.gravatar?.avatar_url
    ? `<img src="${esc(em.gravatar.avatar_url)}" class="target-avatar" alt="Avatar" onerror="this.style.display='none'" />`
    : foundGH
      ? `<img src="${esc(foundGH.avatar)}" class="target-avatar" alt="Avatar" onerror="this.style.display='none'" />`
      : `<div class="target-avatar-placeholder"><i class="fa-solid fa-user-secret"></i></div>`;

  const headerTags = [
    t.name  ? tag(t.name,  'blue')   : '',
    t.email ? tag(t.email, 'purple') : '',
    t.phone ? tag(t.phone, 'green')  : '',
  ].filter(Boolean).join('');

  targetEl.innerHTML = `
    ${avatarHtml}
    <div class="target-info">
      <div class="target-label">OSINT Intelligence Report</div>
      <div class="target-name">${esc(t.name || t.email || t.phone || 'Unknown Subject')}</div>
      <div class="target-tags">${headerTags}</div>
    </div>`;

  // ── Counts ────────────────────────────────────────────────
  const ghCount     = (nm.github_profiles   || []).filter(p => p.found).length;
  const rdCount     = (nm.reddit_profiles   || []).filter(p => p.found).length;
  const kbCount     = (nm.keybase_profiles  || []).filter(p => p.found).length;
  const devtoCount  = (nm.devto_profiles    || []).filter(p => p.found).length;
  const mastoCount  = (nm.mastodon_accounts || []).filter(a => a.found).length;
  const wikiCount   = nm.wikipedia?.results?.length || 0;
  const kNewsCount  = nm.kenya_intel?.news?.results?.length || 0;
  const kSocCount   = nm.kenya_intel?.social_dirs?.results?.length || 0;
  const kPhoneCount = ph.kenya_phone_mentions?.results?.length || 0;
  const webCount    = (nm.web_intel?.bing?.results?.length || 0)
                    + (em.web_intel?.bing?.results?.length || 0)
                    + (ph.web_intel?.bing?.results?.length || 0);
  const breachCount  = em.breach_data?.count || 0;
  const hasGravatar  = em.gravatar?.exists === true;
  const hasCallerName = !!(ph.reverse_lookup?.caller_name);
  const hasEmailRep  = !!(em.email_rep && !em.email_rep.error);
  const hasMX        = (em.mx_records?.records?.length || 0) > 0;
  const parts = nm.name_parts || {};

  // ── Executive summary prose ───────────────────────────────
  const findings = [
    ghCount     > 0 ? `${ghCount} GitHub profile${ghCount     > 1 ? 's' : ''}` : null,
    rdCount     > 0 ? `${rdCount} Reddit account${rdCount     > 1 ? 's' : ''}` : null,
    kbCount     > 0 ? `${kbCount} Keybase profile${kbCount    > 1 ? 's' : ''}` : null,
    devtoCount  > 0 ? `${devtoCount} DEV.to profile${devtoCount > 1 ? 's' : ''}` : null,
    mastoCount  > 0 ? `${mastoCount} Mastodon account${mastoCount > 1 ? 's' : ''}` : null,
    wikiCount   > 0 ? `${wikiCount} Wikipedia result${wikiCount > 1 ? 's' : ''}` : null,
    kNewsCount  > 0 ? `${kNewsCount} Kenyan news mention${kNewsCount > 1 ? 's' : ''}` : null,
    kSocCount   > 0 ? `${kSocCount} Kenya social/directory result${kSocCount > 1 ? 's' : ''}` : null,
    kPhoneCount > 0 ? `${kPhoneCount} phone public mention${kPhoneCount > 1 ? 's' : ''}` : null,
    webCount    > 0 ? `${webCount} web search result${webCount > 1 ? 's' : ''}` : null,
    hasGravatar       ? 'Gravatar profile confirmed' : null,
    breachCount > 0   ? `${breachCount} data breach${breachCount > 1 ? 'es' : ''}` : null,
    hasCallerName     ? `caller ID: ${ph.reverse_lookup.caller_name}` : null,
  ].filter(Boolean);

  const identProse = [
    t.name  ? `name <strong>${esc(t.name)}</strong>`  : null,
    t.email ? `email <strong>${esc(t.email)}</strong>` : null,
    t.phone ? `phone <strong>${esc(t.phone)}</strong>` : null,
  ].filter(Boolean);

  const execSummaryText = (identProse.length ? `Subject queried by ${identProse.join(', ')}. ` : '')
    + (findings.length
      ? `Intelligence gathering returned: ${findings.join('; ')}.`
      : 'Intelligence gathering returned limited public results. The subject may have a low digital footprint or the queried identifiers did not match public records.');

  // ── Local helpers ─────────────────────────────────────────
  function docSec(num, icon, title, bodyHtml) {
    return `<div class="doc-section">
      <div class="doc-section-header">
        <span class="doc-section-num">${num}</span>
        <i class="fa-solid ${icon}"></i>
        <span class="doc-section-title">${esc(title)}</span>
      </div>
      <div class="doc-section-body">${bodyHtml}</div>
    </div>`;
  }

  function docKV(pairs) {
    const rows = pairs.filter(Boolean).map(([k, v]) =>
      `<div class="doc-kv-row"><span class="doc-kv-k">${esc(k)}</span><span class="doc-kv-v">${esc(String(v))}</span></div>`
    );
    return rows.length ? `<div class="doc-kv-table">${rows.join('')}</div>` : '';
  }

  function docResultList(results, emptyMsg) {
    if (!results?.length) return `<p class="doc-empty">${esc(emptyMsg || 'No results found.')}</p>`;
    return `<div class="doc-result-list">${results.map(r => `
      <a href="${esc(r.url)}" target="_blank" rel="noopener" class="doc-result">
        <div class="doc-result-title">${esc(r.title)}</div>
        <div class="doc-result-url">${esc(r.display_url || r.url)}</div>
        ${r.snippet ? `<div class="doc-result-snippet">${esc(r.snippet)}</div>` : ''}
      </a>`).join('')}</div>`;
  }

  function docGHProfile(p) {
    return `<div class="doc-profile">
      <img src="${esc(p.avatar)}" class="doc-avatar" alt="${esc(p.username)}" onerror="this.style.display='none'" />
      <div class="doc-profile-info">
        <a href="${esc(p.url)}" target="_blank" rel="noopener" class="doc-profile-name">
          <i class="fa-brands fa-github"></i> @${esc(p.username)}
          ${p.name ? `<span class="doc-profile-realname">${esc(p.name)}</span>` : ''}
        </a>
        ${p.bio      ? `<div class="doc-profile-bio">${esc(p.bio)}</div>` : ''}
        ${p.location ? `<div class="doc-profile-bio"><i class="fa-solid fa-location-dot"></i> ${esc(p.location)}</div>` : ''}
        <div class="doc-profile-meta">
          ${p.public_repos != null ? `<span><i class="fa-solid fa-book"></i> ${p.public_repos} repos</span>` : ''}
          ${p.followers    != null ? `<span><i class="fa-solid fa-users"></i> ${p.followers} followers</span>` : ''}
          ${p.email   ? `<span><i class="fa-solid fa-envelope"></i> ${esc(p.email)}</span>` : ''}
          ${p.twitter ? `<span><i class="fa-brands fa-x-twitter"></i> @${esc(p.twitter)}</span>` : ''}
        </div>
      </div>
    </div>`;
  }

  // ── SECTION 1: Subject Identification ─────────────────────
  let sec1 = '';
  if (t.name) {
    sec1 += `<div class="doc-subsection-title">Name</div>`;
    sec1 += docKV([
      ['Full Name', parts.full || t.name],
      parts.first  ? ['First Name', parts.first]  : null,
      parts.middle ? ['Middle Name', parts.middle] : null,
      parts.last   ? ['Last Name', parts.last]     : null,
    ]);
    const na = nm.name_analysis;
    if (na && (na.gender || na.age || na.nationalities?.length)) {
      const demoPairs = [
        na.gender ? ['Predicted Gender', `${na.gender.gender === 'male' ? '♂' : '♀'} ${na.gender.gender} (${na.gender.probability}% confidence, n=${Number(na.gender.sample_size||0).toLocaleString()})`] : null,
        na.age    ? ['Predicted Age', `~${na.age.predicted_age} years (${Number(na.age.sample_size||0).toLocaleString()} records)`] : null,
        na.nationalities?.length ? ['Name Origin', na.nationalities.slice(0,3).map(n => `${n.name} ${n.probability}%`).join(' · ')] : null,
      ];
      sec1 += `<div class="doc-subsection-title">Demographics (Statistical)</div>`;
      sec1 += docKV(demoPairs);
      sec1 += `<p class="doc-note"><i class="fa-solid fa-circle-info"></i> Predictions from genderize.io / agify.io / nationalize.io — statistical only.</p>`;
    }
  }

  if (t.email) {
    sec1 += `<div class="doc-subsection-title">Email Address</div>`;
    sec1 += docKV([
      ['Address', t.email],
      em.domain   ? ['Domain', em.domain]     : null,
      em.provider ? ['Provider', em.provider] : null,
      em.username ? ['Username', em.username] : null,
      ['Format Valid', em.valid ? '✓ Yes' : '✗ No'],
      em.is_disposable ? ['Disposable', '⚠ Yes — temporary address'] : null,
      em.is_corporate  ? ['Type', 'Corporate / Custom Domain'] : null,
    ]);
  }

  if (t.phone) {
    sec1 += `<div class="doc-subsection-title">Phone Number</div>`;
    sec1 += docKV([
      ['Number', ph.formats?.International || t.phone],
      ph.country_name ? ['Country', ph.country_name] : null,
      ph.location     ? ['Location', ph.location]    : null,
      ph.carrier      ? ['Carrier', ph.carrier]      : null,
      ph.line_type    ? ['Line Type', ph.line_type]  : null,
      ph.timezones?.length ? ['Timezone', ph.timezones.join(', ')] : null,
      ['Valid', ph.valid ? '✓ Yes' : (ph.partial ? 'Partial / Wildcard' : '✗ No')],
    ]);
  }

  if (!sec1) sec1 = '<p class="doc-empty">No subject identifiers provided.</p>';

  // ── SECTION 2: Digital Footprint ──────────────────────────
  let sec2 = '';

  const ghFound = (nm.github_profiles || []).filter(p => p.found);
  if (ghFound.length) {
    sec2 += `<div class="doc-subsection-title"><i class="fa-brands fa-github"></i> GitHub Profiles (${ghFound.length} found)</div>`;
    sec2 += ghFound.map(docGHProfile).join('');
  } else if (t.name) {
    sec2 += `<div class="doc-empty-inline"><i class="fa-brands fa-github"></i> No GitHub profiles found for generated username patterns</div>`;
  }

  const rdFound = (nm.reddit_profiles || []).filter(p => p.found);
  if (rdFound.length) {
    sec2 += `<div class="doc-subsection-title"><i class="fa-brands fa-reddit"></i> Reddit Accounts (${rdFound.length} found)</div>`;
    sec2 += rdFound.map(p => `<div class="doc-profile">
      <div class="doc-avatar-placeholder"><i class="fa-brands fa-reddit"></i></div>
      <div class="doc-profile-info">
        <a href="${esc(p.url)}" target="_blank" rel="noopener" class="doc-profile-name">u/${esc(p.username)}</a>
        <div class="doc-profile-meta">
          ${p.karma != null ? `<span><i class="fa-solid fa-arrow-up"></i> ${Number(p.karma).toLocaleString()} karma</span>` : ''}
          ${p.is_gold ? '<span><i class="fa-solid fa-star"></i> Gold</span>' : ''}
        </div>
      </div>
    </div>`).join('');
  } else if (t.name) {
    sec2 += `<div class="doc-empty-inline"><i class="fa-brands fa-reddit"></i> No Reddit accounts found</div>`;
  }

  const kbFound = (nm.keybase_profiles || []).filter(p => p.found);
  if (kbFound.length) {
    sec2 += `<div class="doc-subsection-title"><i class="fa-solid fa-key"></i> Keybase Profiles (${kbFound.length} found)</div>`;
    sec2 += kbFound.map(p => `<div class="doc-profile">
      <div class="doc-avatar-placeholder"><i class="fa-solid fa-key"></i></div>
      <div class="doc-profile-info">
        <a href="${esc(p.url)}" target="_blank" rel="noopener" class="doc-profile-name">${esc(p.display_name || p.username)}</a>
        ${p.full_name ? `<div class="doc-profile-bio">${esc(p.full_name)}</div>` : ''}
        ${p.location  ? `<div class="doc-profile-bio"><i class="fa-solid fa-location-dot"></i> ${esc(p.location)}</div>` : ''}
      </div>
    </div>`).join('');
  }

  const devFound = (nm.devto_profiles || []).filter(p => p.found);
  if (devFound.length) {
    sec2 += `<div class="doc-subsection-title"><i class="fa-brands fa-dev"></i> DEV.to Profiles (${devFound.length} found)</div>`;
    sec2 += devFound.map(p => `<div class="doc-profile">
      ${p.profile_image ? `<img src="${esc(p.profile_image)}" class="doc-avatar" alt="${esc(p.username)}" />` : `<div class="doc-avatar-placeholder"><i class="fa-brands fa-dev"></i></div>`}
      <div class="doc-profile-info">
        <a href="${esc(p.url)}" target="_blank" rel="noopener" class="doc-profile-name">${esc(p.name || p.username)}</a>
        ${p.summary  ? `<div class="doc-profile-bio">${esc(p.summary)}</div>` : ''}
        ${p.location ? `<div class="doc-profile-bio"><i class="fa-solid fa-location-dot"></i> ${esc(p.location)}</div>` : ''}
        <div class="doc-profile-meta">
          ${p.github_username  ? `<span><i class="fa-brands fa-github"></i> ${esc(p.github_username)}</span>` : ''}
          ${p.twitter_username ? `<span><i class="fa-brands fa-x-twitter"></i> @${esc(p.twitter_username)}</span>` : ''}
        </div>
      </div>
    </div>`).join('');
  }

  const mastoFound = (nm.mastodon_accounts || []).filter(a => a.found);
  if (mastoFound.length) {
    sec2 += `<div class="doc-subsection-title"><i class="fa-brands fa-mastodon"></i> Mastodon Accounts (${mastoFound.length} found)</div>`;
    sec2 += mastoFound.map(a => `<div class="doc-profile">
      ${a.avatar ? `<img src="${esc(a.avatar)}" class="doc-avatar" alt="${esc(a.username)}" />` : `<div class="doc-avatar-placeholder"><i class="fa-brands fa-mastodon"></i></div>`}
      <div class="doc-profile-info">
        <a href="${esc(a.url)}" target="_blank" rel="noopener" class="doc-profile-name">@${esc(a.username)}</a>
        ${a.display_name ? `<div class="doc-profile-bio">${esc(a.display_name)}</div>` : ''}
        ${a.bio          ? `<div class="doc-profile-bio">${esc(a.bio)}</div>`          : ''}
        <div class="doc-profile-meta">
          ${a.followers != null ? `<span><i class="fa-solid fa-users"></i> ${Number(a.followers).toLocaleString()} followers</span>` : ''}
          ${a.statuses  != null ? `<span><i class="fa-solid fa-comment"></i> ${Number(a.statuses).toLocaleString()} posts</span>` : ''}
        </div>
      </div>
    </div>`).join('');
  }

  const wikiResults = nm.wikipedia?.results || [];
  if (wikiResults.length) {
    sec2 += `<div class="doc-subsection-title"><i class="fa-brands fa-wikipedia-w"></i> Wikipedia Results (${wikiResults.length})</div>`;
    sec2 += `<div class="doc-result-list">${wikiResults.map(r => `
      <a href="${esc(r.url)}" target="_blank" rel="noopener" class="doc-result">
        <div class="doc-result-title"><i class="fa-brands fa-wikipedia-w"></i> ${esc(r.title)}</div>
        ${r.snippet ? `<div class="doc-result-snippet">${esc(r.snippet)}…</div>` : ''}
      </a>`).join('')}</div>`;
  }

  // Social platform DDG results
  const sp = nm.social_profiles || {};
  [
    { key: 'linkedin',  icon: 'fa-brands fa-linkedin',  label: 'LinkedIn' },
    { key: 'instagram', icon: 'fa-brands fa-instagram',  label: 'Instagram' },
    { key: 'facebook',  icon: 'fa-brands fa-facebook',   label: 'Facebook' },
    { key: 'tiktok',    icon: 'fa-brands fa-tiktok',     label: 'TikTok' },
  ].forEach(({ key, icon, label }) => {
    const r = (sp[key] || {}).results || [];
    if (r.length) {
      sec2 += `<div class="doc-subsection-title"><i class="${icon}"></i> ${label} Results (${r.length})</div>`;
      sec2 += docResultList(r);
    }
  });

  if (!sec2 && !t.name) sec2 = '<p class="doc-empty">No name provided — digital footprint search not performed.</p>';
  if (!sec2) sec2 = '<p class="doc-empty">No profiles found across queried platforms.</p>';

  // ── SECTION 3: Kenya Intelligence ─────────────────────────
  let sec3 = '';
  if (nm.kenya_intel?.news?.results?.length) {
    sec3 += `<div class="doc-subsection-title"><i class="fa-newspaper"></i> Kenya News Mentions (${nm.kenya_intel.news.results.length})</div>`;
    sec3 += docResultList(nm.kenya_intel.news.results);
  }
  if (nm.kenya_intel?.social_dirs?.results?.length) {
    sec3 += `<div class="doc-subsection-title"><i class="fa-earth-africa"></i> Kenya Social & Directory Results (${nm.kenya_intel.social_dirs.results.length})</div>`;
    sec3 += docResultList(nm.kenya_intel.social_dirs.results);
  }
  if (nm.kenya_intel?.gov?.results?.length) {
    sec3 += `<div class="doc-subsection-title"><i class="fa-landmark"></i> Government & Institutional Records (${nm.kenya_intel.gov.results.length})</div>`;
    sec3 += docResultList(nm.kenya_intel.gov.results);
    sec3 += `<p class="doc-note"><i class="fa-solid fa-circle-info"></i> Sources: NTSA, BRS, KRA, LSK, KMPDB, Kenya Gazette, MyGov, KACC, NEMA, NHIF, NSSF, Judiciary, eCitizen, KEBS.</p>`;
  }
  if (ph.kenya_phone_mentions?.results?.length) {
    sec3 += `<div class="doc-subsection-title"><i class="fa-phone"></i> Phone Number Public Mentions — Kenya (${ph.kenya_phone_mentions.results.length})</div>`;
    sec3 += docResultList(ph.kenya_phone_mentions.results);
  }
  if (!sec3) sec3 = `<p class="doc-empty">${(t.name || t.phone) ? 'No Kenyan public records or mentions found for the provided identifiers.' : 'No name or phone provided for Kenya intelligence search.'}</p>`;

  // ── SECTION 4: Web Intelligence ───────────────────────────
  let sec4 = '';
  const allWebResults = [
    ...(nm.web_intel?.bing?.results || []),
    ...(em.web_intel?.bing?.results || []),
    ...(ph.web_intel?.bing?.results || []),
  ];

  const ddgAbstract = nm.web_intel?.ddg?.abstract;
  if (ddgAbstract) {
    sec4 += `<div class="doc-abstract">
      <div class="doc-abstract-text">${esc(ddgAbstract)}</div>
      ${nm.web_intel.ddg.abstract_source ? `<div class="doc-abstract-src">Source: ${esc(nm.web_intel.ddg.abstract_source)}</div>` : ''}
    </div>`;
  }

  const ddgFacts = nm.web_intel?.ddg?.facts;
  if (ddgFacts?.length) {
    sec4 += `<div class="doc-subsection-title">Quick Facts</div>`;
    sec4 += `<div class="doc-kv-table">${ddgFacts.map(f =>
      `<div class="doc-kv-row"><span class="doc-kv-k">${esc(f.label)}</span><span class="doc-kv-v">${esc(f.value)}</span></div>`
    ).join('')}</div>`;
  }

  if (allWebResults.length) {
    sec4 += `<div class="doc-subsection-title">Web Results (${allWebResults.length} total via DuckDuckGo)</div>`;
    sec4 += docResultList(allWebResults);
  } else {
    sec4 += '<p class="doc-empty">No web results returned. Subject may have a low public online presence.</p>';
  }

  // ── SECTION 5: Email Intelligence ─────────────────────────
  let sec5 = '';
  if (!t.email) {
    sec5 = '<p class="doc-empty">No email address provided.</p>';
  } else {
    const er = em.email_rep;
    if (er && !er.error) {
      const repColor = er.reputation === 'high' ? '#10b981' : er.reputation === 'medium' ? '#f59e0b' : '#ef4444';
      sec5 += `<div class="doc-subsection-title">Email Reputation (emailrep.io)</div>`;
      sec5 += `<div class="doc-rep-banner" style="border-color:${repColor}">
        <span class="doc-rep-score" style="color:${repColor}">${esc(String(er.reputation || 'unknown').toUpperCase())} REPUTATION</span>
        <span class="doc-rep-flag">${er.suspicious ? '⚠ Suspicious' : '✓ Not suspicious'}</span>
      </div>`;
      sec5 += docKV([
        er.references != null  ? ['References', String(er.references)]              : null,
        er.first_seen          ? ['First Seen', String(er.first_seen)]              : null,
        er.last_seen           ? ['Last Seen', String(er.last_seen)]                : null,
        er.deliverable != null ? ['Deliverable', er.deliverable ? '✓ Yes' : '✗ No'] : null,
        er.data_breach         ? ['Data Breach', '⚠ Yes']                           : null,
        er.credentials_leaked  ? ['Credentials Leaked', '⚠ Yes']                   : null,
        er.malicious_activity  ? ['Malicious Activity', '⚠ Yes']                   : null,
        er.spam                ? ['Spam', '⚠ Associated with spam']                 : null,
        er.blacklisted         ? ['Blacklisted', '⚠ Yes']                           : null,
      ]);
      const erProfiles = Array.isArray(er.profiles) ? er.profiles : [];
      if (erProfiles.length) {
        sec5 += `<div class="doc-subsection-title">Linked Profiles (via EmailRep)</div>`;
        sec5 += `<div class="doc-tag-list">${erProfiles.map(p => `<span class="doc-tag">${esc(String(p))}</span>`).join('')}</div>`;
      }
    } else if (er?.error) {
      sec5 += `<div class="doc-empty-inline"><i class="fa-solid fa-circle-info"></i> EmailRep: ${esc(String(er.error))}</div>`;
    } else {
      sec5 += `<div class="doc-empty-inline"><i class="fa-solid fa-circle-info"></i> EmailRep unavailable (10 req/day free limit)</div>`;
    }

    const g = em.gravatar;
    if (g?.exists) {
      sec5 += `<div class="doc-subsection-title">Gravatar</div>`;
      sec5 += `<div class="doc-profile">
        <img src="${esc(g.avatar_url)}" class="doc-avatar" alt="Gravatar" />
        <div class="doc-profile-info">
          <a href="${esc(g.profile_url)}" target="_blank" rel="noopener" class="doc-profile-name">Gravatar Profile Found</a>
          <div class="doc-profile-bio">MD5: <code>${esc(g.hash)}</code></div>
        </div>
      </div>`;
    } else if (g) {
      sec5 += `<div class="doc-empty-inline"><i class="fa-solid fa-user-slash"></i> No Gravatar profile (MD5: ${esc(g.hash)})</div>`;
    }

    const breach = em.breach_data;
    if (!breach?.configured) {
      sec5 += `<div class="doc-empty-inline"><i class="fa-solid fa-key"></i> HIBP breach check not configured — set HIBP_API_KEY</div>`;
    } else if (breach.breached) {
      sec5 += `<div class="doc-subsection-title">Data Breaches (HaveIBeenPwned) — ${breach.count} found</div>`;
      sec5 += `<div class="doc-breach-list">${breach.breaches.map(br => `
        <div class="doc-breach-item">
          <div class="doc-breach-name"><i class="fa-solid fa-database"></i> ${esc(br.name)}</div>
          <div class="doc-breach-date">Breach date: ${esc(br.date)}</div>
          ${br.data_classes?.length ? `<div class="doc-tag-list" style="margin-top:4px">${br.data_classes.map(dc => `<span class="doc-tag doc-tag-red">${esc(dc)}</span>`).join('')}</div>` : ''}
        </div>`).join('')}</div>`;
    } else if (!breach.error) {
      sec5 += `<div class="doc-empty-inline"><i class="fa-solid fa-shield-halved" style="color:#10b981"></i> No breaches found in HaveIBeenPwned database</div>`;
    }

    const mx = em.mx_records;
    if (mx?.records?.length) {
      const mxPairs = mx.records.map(r => [`MX Priority ${r.priority}`, r.exchange]);
      const txt = em.txt_records || {};
      if (txt.spf)   mxPairs.push(['SPF', txt.spf]);
      if (txt.dmarc) mxPairs.push(['DMARC', txt.dmarc]);
      sec5 += `<div class="doc-subsection-title">DNS / Mail Records</div>${docKV(mxPairs)}`;
    }

    const w = em.whois;
    if (w && !w.error && !w.note) {
      const wPairs = [
        w.registrar      ? ['Registrar', w.registrar]         : null,
        w.organization   ? ['Organization', w.organization]   : null,
        w.country        ? ['Country', w.country]             : null,
        w.creation_date  ? ['Created', w.creation_date]       : null,
        w.expiration_date ? ['Expires', w.expiration_date]    : null,
      ];
      if (wPairs.some(Boolean)) sec5 += `<div class="doc-subsection-title">Domain WHOIS</div>${docKV(wPairs)}`;
    }
  }

  // ── SECTION 6: Phone Intelligence ─────────────────────────
  let sec6 = '';
  if (!t.phone) {
    sec6 = '<p class="doc-empty">No phone number provided.</p>';
  } else {
    const rev = ph.reverse_lookup ?? {};
    const nv  = ph.numverify ?? {};

    if (rev.configured) {
      if (rev.caller_name) {
        sec6 += `<div class="doc-subsection-title">Caller ID / Reverse Lookup (Twilio)</div>`;
        sec6 += docKV([
          ['Caller Name', String(rev.caller_name)],
          rev.caller_type ? ['Name Type', rev.caller_type === 'CONSUMER' ? 'Consumer (individual)' : rev.caller_type === 'BUSINESS' ? 'Business' : String(rev.caller_type)] : null,
          rev.carrier_name ? ['Carrier (live)', String(rev.carrier_name)] : null,
          rev.line_type    ? ['Line Type (live)', String(rev.line_type)]  : null,
          rev.mobile_country_code ? ['MCC', String(rev.mobile_country_code)] : null,
          rev.mobile_network_code ? ['MNC', String(rev.mobile_network_code)] : null,
        ]);
      } else {
        sec6 += `<div class="doc-empty-inline"><i class="fa-solid fa-address-card"></i> No CNAM record — number may be unlisted</div>`;
        if (rev.carrier_name) sec6 += docKV([['Carrier (live)', String(rev.carrier_name)], rev.line_type ? ['Line Type (live)', String(rev.line_type)] : null]);
      }
    } else if (!nv.configured) {
      sec6 += `<div class="doc-empty-inline"><i class="fa-solid fa-key"></i> Caller ID not configured — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN or NUMVERIFY_API_KEY</div>`;
    }

    if (nv.configured && !nv.error) {
      const nvPairs = [
        nv.location  ? ['Location (NumVerify)', String(nv.location)]  : null,
        nv.carrier   ? ['Carrier (NumVerify)', String(nv.carrier)]    : null,
        nv.line_type ? ['Line Type (NumVerify)', String(nv.line_type)] : null,
      ];
      if (nvPairs.some(Boolean)) sec6 += `<div class="doc-subsection-title">NumVerify Enrichment</div>${docKV(nvPairs)}`;
    }

    if (ph.formats) {
      sec6 += `<div class="doc-subsection-title">Number Formats</div>`;
      sec6 += docKV(Object.entries(ph.formats).map(([k, v]) => [k, v]));
    }
  }

  // ── SECTION 7: Cross-Reference ────────────────────────────
  let sec7 = '';
  if (cr.notes?.length) {
    sec7 += `<div class="doc-subsection-title">Cross-Reference Notes</div>`;
    sec7 += `<ul class="doc-note-list">${cr.notes.map(n => `<li><i class="fa-solid fa-lightbulb"></i> ${esc(n)}</li>`).join('')}</ul>`;
  }
  const identsUsed = [t.name, t.email, t.phone].filter(Boolean);
  sec7 += `<div class="doc-subsection-title">Identifiers Used</div>`;
  sec7 += docKV(identsUsed.map((id, i) => [`Identifier ${i + 1}`, id]));
  if (!cr.notes?.length && identsUsed.length < 2) {
    sec7 += `<p class="doc-note"><i class="fa-solid fa-circle-info"></i> Provide two or more identifiers for cross-reference correlation.</p>`;
  }

  // ── SECTION 8: Methodology ────────────────────────────────
  const sources = [
    { name: 'GitHub API',                       what: 'Profile lookup by generated username patterns',                                                                                                           found: ghCount > 0,            skip: !t.name },
    { name: 'Reddit API',                        what: 'Account existence check by username',                                                                                                                      found: rdCount > 0,            skip: !t.name },
    { name: 'Keybase API',                       what: 'Profile lookup by username',                                                                                                                               found: kbCount > 0,            skip: !t.name },
    { name: 'DEV.to API',                        what: 'Profile lookup by username',                                                                                                                               found: devtoCount > 0,         skip: !t.name },
    { name: 'Mastodon API (mastodon.social)',     what: 'Account search by name',                                                                                                                                  found: mastoCount > 0,         skip: !t.name },
    { name: 'Wikipedia API',                     what: 'Full-text search by name',                                                                                                                                 found: wikiCount > 0,          skip: !t.name },
    { name: 'DuckDuckGo Instant Answer',         what: 'Abstract / infobox / quick facts',                                                                                                                        found: !!(nm.web_intel?.ddg?.abstract) },
    { name: 'DuckDuckGo HTML Search (Name)',     what: 'Open web results for name query',                                                                                                                         found: (nm.web_intel?.bing?.results?.length || 0) > 0, skip: !t.name },
    { name: 'DuckDuckGo HTML Search (Email)',    what: 'Open web results for email query',                                                                                                                        found: (em.web_intel?.bing?.results?.length || 0) > 0, skip: !t.email },
    { name: 'DuckDuckGo HTML Search (Phone)',    what: 'Open web results for phone query',                                                                                                                        found: (ph.web_intel?.bing?.results?.length || 0) > 0, skip: !t.phone },
    { name: 'Kenya News Sites (DDG scrape)',      what: 'Nation, Standard, Tuko, The Star, Citizen, Business Daily, KBC, Capital FM',                                                                             found: kNewsCount > 0,         skip: !t.name },
    { name: 'Kenya Social & Directories',        what: 'Twitter/X, Facebook, LinkedIn, Instagram, TikTok, Yellow Pages KE, PigiaMe, Jiji, BrighterMonday, eCitizen, Judiciary, M-Changa',                       found: kSocCount > 0,          skip: !t.name },
    { name: 'Kenya Gov & Institutional (DDG)',   what: 'NTSA, BRS, KRA, LSK, KMPDB, Kenya Gazette, MyGov, KACC, NEMA, NHIF, NSSF, Judiciary, eCitizen, KIPI',                                                   found: (nm.kenya_intel?.gov?.results?.length || 0) > 0, skip: !t.name },
    { name: 'Kenya Phone Mentions',              what: 'Public mentions of phone number in Kenyan web sources',                                                                                                   found: kPhoneCount > 0,        skip: !t.phone || !ph.kenya_phone_mentions },
    { name: 'LinkedIn DDG Search',               what: 'linkedin.com/in profile discovery via DuckDuckGo HTML scrape',                                                                                            found: (nm.social_profiles?.linkedin?.results?.length || 0) > 0, skip: !t.name },
    { name: 'Instagram DDG Search',             what: 'instagram.com profile discovery via DuckDuckGo HTML scrape',                                                                                              found: (nm.social_profiles?.instagram?.results?.length || 0) > 0, skip: !t.name },
    { name: 'Facebook DDG Search',              what: 'facebook.com profile discovery via DuckDuckGo HTML scrape',                                                                                               found: (nm.social_profiles?.facebook?.results?.length || 0) > 0, skip: !t.name },
    { name: 'TikTok DDG Search',                what: 'tiktok.com profile discovery via DuckDuckGo HTML scrape',                                                                                                 found: (nm.social_profiles?.tiktok?.results?.length || 0) > 0, skip: !t.name },
    { name: 'Gravatar',                          what: 'Avatar and profile lookup by email MD5 hash',                                                                                                             found: hasGravatar,             skip: !t.email },
    { name: 'HaveIBeenPwned (HIBP)',             what: 'Data breach check by email address',                                                                                                                      found: breachCount > 0,        skip: !t.email || !em.breach_data?.configured },
    { name: 'EmailRep.io',                       what: 'Email reputation, history, and linked profiles',                                                                                                          found: hasEmailRep,             skip: !t.email },
    { name: 'DNS (MX, SPF, DMARC)',              what: 'Mail server and domain record lookup',                                                                                                                    found: hasMX,                   skip: !t.email },
    { name: 'WHOIS',                             what: 'Domain registration information',                                                                                                                         found: !!(em.whois && !em.whois.error && !em.whois.note), skip: !t.email },
    { name: 'Twilio Lookup API',                 what: 'Caller ID (CNAM) and live carrier lookup',                                                                                                                found: hasCallerName,           skip: !t.phone || !ph.reverse_lookup?.configured },
    { name: 'NumVerify API',                     what: 'Phone number enrichment and carrier data',                                                                                                                found: !!(ph.numverify?.carrier), skip: !t.phone || !ph.numverify?.configured },
    { name: 'genderize.io',                      what: 'Predicted gender from first name (statistical)',                                                                                                          found: !!(nm.name_analysis?.gender),            skip: !t.name },
    { name: 'agify.io',                          what: 'Predicted age from first name (statistical)',                                                                                                             found: !!(nm.name_analysis?.age),               skip: !t.name },
    { name: 'nationalize.io',                    what: 'Predicted nationality from first name (statistical)',                                                                                                     found: !!(nm.name_analysis?.nationalities?.length), skip: !t.name },
  ].filter(s => !s.skip);

  const sec8 = `<div class="doc-method-list">${sources.map((s, i) => `
    <div class="doc-method-item">
      <span class="doc-method-num">${i + 1}</span>
      <div class="doc-method-body">
        <div class="doc-method-name">${esc(s.name)}</div>
        <div class="doc-method-what">${esc(s.what)}</div>
      </div>
      <span class="${s.found ? 'doc-found' : 'doc-not-found'}">${s.found ? '✓ Found' : '— None'}</span>
    </div>`).join('')}</div>`;

  // ── Further Research ──────────────────────────────────────
  const researchSections = [];
  if (nm.username_profile_links) {
    const flat = {};
    for (const [un, links] of Object.entries(nm.username_profile_links).slice(0, 5)) {
      for (const [platform, url] of Object.entries(links)) flat[`${platform} (@${un})`] = url;
    }
    if (Object.keys(flat).length) researchSections.push({ title: 'Name — Profile Links by Username', links: flat });
  }
  if (nm.search_links) researchSections.push({ title: 'Name — Search Links', links: nm.search_links });
  if (nm.google_dorks) researchSections.push({ title: 'Name — Google Dorks', links: nm.google_dorks });
  if (em.search_links) researchSections.push({ title: 'Email — Search Links', links: em.search_links });
  if (ph.search_links) researchSections.push({ title: 'Phone — Search Links', links: ph.search_links });
  if (cr.search_links) researchSections.push({ title: 'Cross-Reference — Combined Search', links: cr.search_links });
  if (cr.google_dorks) researchSections.push({ title: 'Cross-Reference — Google Dorks', links: cr.google_dorks });

  // ── Conflict clarification panel ──────────────────────────
  const conflicts = Array.isArray(d.conflicts) ? d.conflicts : [];
  let conflictsHtml = '';
  if (conflicts.length) {
    conflictsHtml = `<div class="doc-conflicts">
      <div class="doc-conflicts-header">
        <i class="fa-solid fa-triangle-exclamation"></i>
        ${conflicts.length} Data Conflict${conflicts.length > 1 ? 's' : ''} Detected — Clarification Requested
      </div>
      <div class="doc-conflicts-body">
        ${conflicts.map((c, ci) => {
          const opts = Array.isArray(c.options) ? c.options : [];
          return `<div class="doc-conflict" id="conflict-${ci}">
            <div class="doc-conflict-type">
              <span class="doc-conflict-badge doc-conflict-${esc(String(c.severity || 'info'))}">${esc(String(c.type || 'conflict').replace(/_/g, ' '))}</span>
            </div>
            <div class="doc-conflict-desc">${esc(String(c.description || ''))}</div>
            ${c.note ? `<div class="doc-conflict-note"><i class="fa-solid fa-circle-info"></i> ${esc(String(c.note))}</div>` : ''}
            <div class="doc-conflict-options">
              ${opts.map((o, oi) => `<label class="doc-conflict-option">
                <input type="radio" name="conflict-${ci}" value="${esc(String(o.value || oi))}" />
                <span>${esc(String(o.label || ''))}</span>
              </label>`).join('')}
            </div>
            <div class="doc-conflict-actions">
              <button class="doc-conflict-resolve-btn" onclick="resolveConflict(${ci}, this)">
                <i class="fa-solid fa-check"></i> Acknowledge &amp; Continue
              </button>
              <div class="doc-conflict-resolved-msg" style="display:none"><i class="fa-solid fa-circle-check"></i> Acknowledged</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // ── Assemble document ─────────────────────────────────────
  const doc = document.createElement('div');
  doc.className = 'osint-doc';
  doc.innerHTML = `
    <div class="doc-exec-summary">
      <div class="doc-exec-label"><i class="fa-solid fa-bullseye"></i> Executive Summary</div>
      <div class="doc-exec-text">${execSummaryText}</div>
    </div>
    ${conflictsHtml}
    ${docSec(1, 'fa-id-card',            'Subject Identification',   sec1)}
    ${docSec(2, 'fa-fingerprint',        'Digital Footprint',        sec2)}
    ${docSec(3, 'fa-earth-africa',       'Kenya Intelligence',       sec3)}
    ${docSec(4, 'fa-globe',              'Web Intelligence',         sec4)}
    ${docSec(5, 'fa-envelope-open-text', 'Email Intelligence',       sec5)}
    ${docSec(6, 'fa-phone-volume',       'Phone Intelligence',       sec6)}
    ${docSec(7, 'fa-link',              'Cross-Reference Findings',  sec7)}
    ${docSec(8, 'fa-microscope',         'Methodology',              sec8)}
  `;
  grid.appendChild(doc);

  const researchEl = furtherResearch(researchSections);
  if (researchEl) {
    researchEl.style.gridColumn = '1 / -1';
    grid.appendChild(researchEl);
  }
}

// ── Helpers ──────────────────────────────────────────────────
function card(title, iconCls, iconColorCls, bodyHtml) {
  const el = document.createElement('div');
  el.className = 'report-card';
  el.innerHTML = `
    <div class="card-header">
      <div class="card-icon ${iconColorCls}"><i class="${iconCls}"></i></div>
      <span class="card-title">${title}</span>
    </div>
    <div class="card-body">${bodyHtml}</div>`;
  return el;
}

function row(label, value) {
  if (value == null || value === '' || value === 'Unknown') return '';
  return `<div class="data-row">
    <span class="data-label">${esc(label)}</span>
    <span class="data-value">${esc(String(value))}</span>
  </div>`;
}

function tag(text, color) {
  return `<span class="tag tag-${color}">${esc(text)}</span>`;
}

function buildLinkList(links) {
  return `<div class="link-list">${Object.entries(links).map(([label, url]) =>
    `<a href="${esc(url)}" target="_blank" rel="noopener" class="link-item">
      <i class="${platformIcon(label)}"></i>
      <span class="link-label">${esc(label)}</span>
      <i class="fa-solid fa-arrow-up-right-from-square link-ext"></i>
    </a>`
  ).join('')}</div>`;
}

function furtherResearch(sections) {
  const filtered = sections.filter(s => s.links && Object.keys(s.links).length > 0);
  if (!filtered.length) return null;
  const body = filtered.map(s => `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${esc(s.title)}</div>
      ${buildLinkList(s.links)}
    </div>`).join('');
  const el = document.createElement('div');
  el.className = 'report-card';
  el.style.gridColumn = '1 / -1';
  el.innerHTML = `
    <details class="research-details">
      <summary class="card-header research-summary">
        <div class="card-icon icon-yellow"><i class="fa-solid fa-magnifying-glass-plus"></i></div>
        <span class="card-title">Further Research Links</span>
        <i class="fa-solid fa-chevron-right research-chevron"></i>
      </summary>
      <div class="card-body">${body}</div>
    </details>`;
  return el;
}

function errorBlock(msg) {
  const el = document.createElement('div');
  el.className = 'error-card';
  el.style.gridColumn = '1 / -1';
  el.innerHTML = `<i class="fa-solid fa-circle-xmark"></i><span>${esc(msg)}</span>`;
  return el;
}

function resolveConflict(ci, btn) {
  const el = document.getElementById(`conflict-${ci}`);
  if (!el) return;
  btn.disabled = true;
  el.querySelectorAll('input[type="radio"]').forEach(r => r.disabled = true);
  const resolved = el.querySelector('.doc-conflict-resolved-msg');
  if (resolved) resolved.style.display = 'flex';
  el.style.opacity = '0.6';
}

function platformIcon(label) {
  const l = label.toLowerCase();
  if (l.includes('github'))    return 'fa-brands fa-github';
  if (l.includes('twitter') || l.includes('x.com')) return 'fa-brands fa-x-twitter';
  if (l.includes('linkedin'))  return 'fa-brands fa-linkedin';
  if (l.includes('instagram')) return 'fa-brands fa-instagram';
  if (l.includes('facebook'))  return 'fa-brands fa-facebook';
  if (l.includes('reddit'))    return 'fa-brands fa-reddit';
  if (l.includes('tiktok'))    return 'fa-brands fa-tiktok';
  if (l.includes('youtube'))   return 'fa-brands fa-youtube';
  if (l.includes('twitch'))    return 'fa-brands fa-twitch';
  if (l.includes('pinterest')) return 'fa-brands fa-pinterest';
  if (l.includes('tumblr'))    return 'fa-brands fa-tumblr';
  if (l.includes('medium'))    return 'fa-brands fa-medium';
  if (l.includes('keybase'))   return 'fa-solid fa-key';
  if (l.includes('wikipedia')) return 'fa-brands fa-wikipedia-w';
  if (l.includes('dev.to') || l.includes('devto')) return 'fa-brands fa-dev';
  if (l.includes('mastodon'))  return 'fa-brands fa-mastodon';
  if (l.includes('whatsapp'))  return 'fa-brands fa-whatsapp';
  if (l.includes('telegram'))  return 'fa-brands fa-telegram';
  if (l.includes('signal'))    return 'fa-solid fa-comment-dots';
  if (l.includes('google'))    return 'fa-brands fa-google';
  if (l.includes('bing'))      return 'fa-solid fa-magnifying-glass';
  if (l.includes('truecaller') || l.includes('spy') || l.includes('who')) return 'fa-solid fa-phone';
  if (l.includes('spokeo') || l.includes('pipl')) return 'fa-solid fa-person-circle-question';
  if (l.includes('dork') || l.includes('code')) return 'fa-solid fa-code';
  if (l.includes('news'))      return 'fa-solid fa-newspaper';
  if (l.includes('image'))     return 'fa-solid fa-image';
  if (l.includes('email') || l.includes('mail')) return 'fa-solid fa-envelope';
  return 'fa-solid fa-arrow-up-right-from-square';
}

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

// ── Export JSON ──────────────────────────────────────────────
function exportJson() {
  if (!lastResult) return;
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shebe-osint-report-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
