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

  // Bing web results
  if (bing.configured && bing.results?.length) {
    html += `<div class="wi-section-label"><i class="fa-solid fa-globe"></i> Web Results${bing.total_estimated ? ` <span class="wi-count">~${Number(bing.total_estimated).toLocaleString()} results</span>` : ''}</div>`;
    html += `<div class="wi-results">${bing.results.map(r => `
      <a href="${esc(r.url)}" target="_blank" rel="noopener" class="wi-result">
        <div class="wi-result-title">${esc(r.title)}</div>
        <div class="wi-result-url">${esc(r.display_url)}</div>
        <div class="wi-result-snippet">${esc(r.snippet)}</div>
        ${r.date ? `<div class="wi-result-date"><i class="fa-regular fa-calendar"></i> ${esc(r.date)}</div>` : ''}
      </a>`).join('')}</div>`;

    // Bing news
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
    html += `<div class="no-data"><i class="fa-solid fa-xmark"></i> Bing: ${esc(String(bing.error))}</div>`;
  } else if (!bing.configured) {
    html += `<div class="no-data" style="font-size:12px"><i class="fa-solid fa-key"></i> Set <code>BING_SEARCH_API_KEY</code> env var for live web results (free: 1000/month).</div>`;
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
    targetEl.innerHTML = `<div class="target-avatar-placeholder"><i class="fa-solid fa-layer-group"></i></div>
      <div class="target-info"><div class="target-label">Hybrid Search</div><div class="target-name">—</div></div>`;
    grid.appendChild(errorBlock(d.error));
    return;
  }

  const t = d.target || {};
  const tags = [
    t.name  ? tag(`Name: ${t.name}`, 'blue') : '',
    t.email ? tag(`Email: ${t.email}`, 'purple') : '',
    t.phone ? tag(`Phone: ${t.phone}`, 'green') : '',
  ].filter(Boolean).join('');

  targetEl.innerHTML = `
    <div class="target-avatar-placeholder"><i class="fa-solid fa-layer-group"></i></div>
    <div class="target-info">
      <div class="target-label">Hybrid Search</div>
      <div class="target-name">${esc([t.name, t.email, t.phone].filter(Boolean).join(' / '))}</div>
      <div class="target-tags">${tags}</div>
    </div>`;

  // Cross-reference card
  const cr = d.cross_reference || {};
  let crContent = '';
  if (cr.notes?.length) {
    crContent += `<div class="note-list">${cr.notes.map(n =>
      `<div class="note-item"><i class="fa-solid fa-lightbulb"></i>${esc(n)}</div>`).join('')}</div>`;
  }
  if (cr.search_links && Object.keys(cr.search_links).length) {
    crContent += `<div style="margin-top:10px"><div style="font-size:13px;font-weight:600;color:var(--text2);margin-bottom:6px">Combined Search</div>${buildLinkList(cr.search_links)}</div>`;
  }
  if (cr.google_dorks && Object.keys(cr.google_dorks).length) {
    crContent += `<div style="margin-top:10px"><div style="font-size:13px;font-weight:600;color:var(--text2);margin-bottom:6px">Cross-Reference Dorks</div>${buildLinkList(cr.google_dorks)}</div>`;
  }
  if (!crContent) {
    crContent = `<div class="no-data"><i class="fa-solid fa-circle-info"></i>Provide two or more identifiers (name, email, phone) for cross-reference links.</div>`;
  }
  grid.appendChild(card('Cross-Reference', 'fa-link', 'icon-orange', crContent));

  // Sub-reports
  if (d.name)  appendSubReport(grid, 'Name Report', 'fa-user', d.name, renderName);
  if (d.email) appendSubReport(grid, 'Email Report', 'fa-envelope', d.email, renderEmail);
  if (d.phone) appendSubReport(grid, 'Phone Report', 'fa-phone', d.phone, renderPhone);
}

function appendSubReport(grid, title, iconCls, data, renderFn) {
  const divider = document.createElement('div');
  divider.className = 'hybrid-section-divider';
  divider.innerHTML = `<i class="fa-solid ${esc(iconCls)}"></i> <span>${esc(title)}</span>`;
  grid.appendChild(divider);

  const dummyTarget = document.createElement('div');
  renderFn(data, dummyTarget, grid);
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
