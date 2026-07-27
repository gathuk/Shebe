'use strict';

// ── State ────────────────────────────────────────────────────
let lastResult = null;
let currentType = 'name';

const PLACEHOLDER = {
  name:  'Enter full name (e.g. Jane Smith)',
  email: 'Enter email address (e.g. jane@example.com)',
  phone: 'e.g. +254 0712 345 678 or +254 0712 *** 456 (use * for unknown digits)',
};

const HINT = {
  name:  'Use the person\'s full name for best results. First and last name required.',
  email: 'Enter the full email address including domain.',
  phone: 'Use international format with country code. Replace unknown digits with * (e.g. +254 0712 *** 456 for a partial Kenyan number).',
  hybrid: 'Combine any of name, email, and phone — the more you provide, the more accurate the cross-referenced results.',
};

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupForm();
  document.getElementById('newSearchBtn').addEventListener('click', resetToSearch);
  document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
});

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentType = btn.dataset.type;
      document.getElementById('queryType').value = currentType;

      const singleGroup = document.getElementById('singleInputGroup');
      const hybridGroup = document.getElementById('hybridInputGroup');

      if (currentType === 'hybrid') {
        hide('singleInputGroup');
        singleGroup.querySelector('.search-input').required = false;
        show('hybridInputGroup');
      } else {
        const input = document.getElementById('queryInput');
        input.placeholder = PLACEHOLDER[currentType];
        input.value = '';
        input.required = true;
        show('singleInputGroup');
        hide('hybridInputGroup');
        input.focus();
      }
      document.getElementById('inputHint').textContent = HINT[currentType];
    });
  });
}

function setupForm() {
  document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (currentType === 'hybrid') {
      const name = document.getElementById('hybridName').value.trim();
      const email = document.getElementById('hybridEmail').value.trim();
      const phone = document.getElementById('hybridPhone').value.trim();
      if (!name && !email && !phone) {
        showError('Provide at least one of: name, email, phone');
        show('resultsSection');
        return;
      }
      await runSearch('hybrid', { name, email, phone });
      return;
    }

    const query = document.getElementById('queryInput').value.trim();
    if (!query) return;
    await runSearch(currentType, { query });
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
  document.getElementById('queryInput').focus();
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

  // --- Username profiles
  if (d.username_profile_links) {
    const linksHtml = Object.entries(d.username_profile_links).map(([label, url]) =>
      `<a href="${esc(url)}" target="_blank" rel="noopener" class="link-item">
        <i class="${platformIcon(label)}"></i>
        <span class="link-label">${esc(label)}</span>
        <span class="link-ext"><i class="fa-solid fa-external-link"></i></span>
      </a>`
    ).join('');
    grid.appendChild(card(`Profiles for @${esc(d.username)}`, 'fa-at', 'icon-green', `<div class="link-list">${linksHtml}</div>`));
  }

  // --- Search links
  if (d.search_links) {
    grid.appendChild(card('Search & Investigation Links', 'fa-magnifying-glass', 'icon-yellow', buildLinkList(d.search_links)));
  }
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

  // Search links
  if (d.search_links) {
    grid.appendChild(card('Search & Lookup Links', 'fa-magnifying-glass', 'icon-yellow', buildLinkList(d.search_links)));
  }
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

  // Username profile links (collapsible per username)
  const profileLinks = d.username_profile_links || {};
  const profileEntries = Object.entries(profileLinks).slice(0, 5);
  if (profileEntries.length) {
    let profileHtml = profileEntries.map(([un, links]) => `
      <div style="margin-bottom:14px">
        <div style="font-size:13px;font-weight:600;color:var(--text2);margin-bottom:6px;font-family:var(--mono)">@${esc(un)}</div>
        <div class="platform-links">
          ${Object.entries(links).map(([platform, url]) =>
            `<a href="${esc(url)}" target="_blank" rel="noopener" class="platform-link">
              <i class="${platformIcon(platform)}"></i> ${esc(platform)}
            </a>`
          ).join('')}
        </div>
      </div>`).join('');
    grid.appendChild(card('Profile Links by Username', 'fa-share-nodes', 'icon-teal', profileHtml));
  }

  // Search links
  if (d.search_links) {
    grid.appendChild(card('Search Platforms', 'fa-magnifying-glass', 'icon-yellow', buildLinkList(d.search_links)));
  }

  // Google Dorks
  if (d.google_dorks) {
    grid.appendChild(card('Google Dorks', 'fa-code', 'icon-orange', buildLinkList(d.google_dorks)));
  }
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
