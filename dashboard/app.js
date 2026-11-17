// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the
// model's own inputs and the protocol's farm plan, plus the live-token and set-aside views.
// No network: every byte it shows is in data.js. The farm plans it shows are the ones
// board.json carries, and the page recomputes each row's implied value from the snapshot
// figures, so the screenshots and the code agree.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var PAGE_SIZE = 50;
  var state = { q: '', category: 'all', chain: 'all', wl: false, tab: 'pre-token', sort: 'implied', dir: -1, page: 1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. Category and chains multipliers follow the same tiers as lib/model.ts.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * row.category_multiplier * row.chains_multiplier));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (k === 'checked') node.checked = !!attrs[k];
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.wl = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.wl) params.set('wl', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.wl && !r.watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' launch candidates below that floor, and sets aside ' + DATA.set_aside.total + ' wrapped, staked and bridged products. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Launch candidates ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Wrapped products set aside' }), el('b', { text: String(DATA.set_aside.total) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; });
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; state.page = 1; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; state.page = 1; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; state.page = 1; writeHash(); render(); });
    var wlBox = el('input', { type: 'checkbox', id: 'wl', checked: state.wl, 'aria-label': 'Watchlist only' });
    wlBox.addEventListener('change', function () { state.wl = wlBox.checked; state.page = 1; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; state.page = 1; writeHash(); render(); } });
    }
    var countText = state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.set_aside.total + ' protocols set aside';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('label', { class: 'check', for: 'wl' }, wlBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }),
        el('div', { class: 'tabs' }, tabBtn('pre-token', 'Pre-token'), tabBtn('live', 'Live token'), tabBtn('set-aside', 'Set aside'))),
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function pager(total, pages) {
    var nav = el('div', { class: 'pager' });
    var prev = el('button', { type: 'button', text: 'Prev', disabled: state.page <= 1 ? 'disabled' : null, onclick: function () { if (state.page > 1) { state.page--; render(); } } });
    nav.appendChild(prev);
    for (var p = 1; p <= pages; p++) {
      (function (page) {
        nav.appendChild(el('button', { type: 'button', text: String(page), 'aria-current': page === state.page ? 'true' : null, onclick: function () { state.page = page; render(); } }));
      })(p);
    }
    nav.appendChild(el('button', { type: 'button', text: 'Next', disabled: state.page >= pages ? 'disabled' : null, onclick: function () { if (state.page < pages) { state.page++; render(); } } }));
    nav.appendChild(el('span', { text: 'Page ' + state.page + ' of ' + pages + ' — ' + total + ' rows' }));
    return nav;
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; state.page = 1; writeHash(); render(); } })
      ));
    }
    var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var pageRows = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    pageRows.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var nameCell = el('div', { class: 'name' },
        el('span', null, el('b', { text: r.name }), r.watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
      );
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, nameCell),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      ),
      pager(list.length, pages)
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function setAsidePanel() {
    var reasons = el('div', { class: 'tiers' }, DATA.set_aside.reasons.map(function (r) {
      return el('div', { class: 'tier' }, el('b', { text: String(r.count) }), el('span', { text: r.reason }));
    }));
    var tbody = el('tbody');
    DATA.set_aside.largest.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', null, el('span', { class: 'status set', text: r.reason }))
      ));
    });
    return el('div', null,
      el('div', { class: 'panel model' },
        el('h2', { text: 'Set aside: wrapped, staked and bridged products' }),
        el('p', { class: 'sub', text: 'These ' + DATA.set_aside.total + ' protocols record no token, but each is a wrapped, staked or bridged product of a token that already trades — WBTC is Bitcoin on Ethereum, a staked-ETH product is ETH in a staking product. They are not protocols still waiting on a launch of their own, so they carry no implied value and no rank.' }),
        reasons
      ),
      el('div', { class: 'panel', style: 'margin-top:16px' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { class: 'sub', text: 'The largest protocols set aside, by TVL.' }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Why set aside' }))),
            tbody
          )
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x category x chains )'
      ),
      el('div', { class: 'tiers' },
        el('div', { class: 'tier' }, el('b', { text: 'x ' + m.category_high }), el('span', { text: 'Fee-capturing: Dexs, Lending, CDP, Derivatives, Yield. A token would share the fees.' })),
        el('div', { class: 'tier' }, el('b', { text: 'x ' + m.category_mid }), el('span', { text: 'Vaults and staking: Risk Curators, Allocators, RWA, Liquid Staking. A token would share the yield.' })),
        el('div', { class: 'tier' }, el('b', { text: 'x 1.00 + chains' }), el('span', { text: 'Everything else at 1.00; each extra chain past the first adds 0.02, up to 1.10.' }))
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every launch candidate below the watchlist floor, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  // The explainer panel: the same model in plain English, with the five drivers and a
  // worked example for the #1 protocol, computed live from the snapshot figures the
  // page already holds. It sits above the table so a reader meets the method before
  // the ranking, and every number in it is recomputed here, never typed in by hand.
  function explainerPanel() {
    var m = DATA.model;
    var top = DATA.rows[0];
    if (!top) return null;
    var base = top.tvl_usd * m.base_multiple;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, top.change_7d === null || top.change_7d === undefined ? 0 : top.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = top.age_days === null || top.age_days === undefined ? m.unknown_age_days : top.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var recomputed = impliedOf(top, m);
    var chainNote = top.chains.length + ' chain' + (top.chains.length === 1 ? '' : 's') + ' (' + top.chains.slice(0, 3).join(', ') + (top.chains.length > 3 ? ', and ' + (top.chains.length - 3) + ' more' : '') + ')';
    return el('section', { class: 'panel explainer', 'aria-label': 'How the value is computed' },
      el('h2', { text: 'How the value is computed' }),
      el('p', { class: 'sub', text: 'Implied value starts with a protocol\u2019s TVL and adjusts it for five things. The same function scores every row, and the worked example below is computed live from the #1 protocol\u2019s own figures — no number in it is typed in by hand.' }),
      el('ol', { class: 'drivers' },
        el('li', null, el('b', { text: '1 · TVL base — \u00d7 ' + m.base_multiple }), el('span', { text: 'A quarter of the TVL — size sets the starting point.' })),
        el('li', null, el('b', { text: '2 · Seven-day growth — weight ' + m.growth_weight }), el('span', { text: 'The week\u2019s change, clamped to ' + m.growth_floor + '% … +' + m.growth_cap + '%. Momentum lifts the base, shrinkage cuts it.' })),
        el('li', null, el('b', { text: '3 · Age with no token — ' + m.maturity_floor + ' to 1.00' }), el('span', { text: 'Time since first listing, capped at ' + (m.maturity_days / 365) + ' years. Longer with no token means a launch would be worth more; unlisted counts as ' + m.unknown_age_days + ' days.' })),
        el('li', null, el('b', { text: '4 · Category — \u00d7 ' + m.category_high + ' / \u00d7 ' + m.category_mid + ' / \u00d7 1.00' }), el('span', { text: 'Fee-capturing gets the top tier, vaults and staking the middle, the rest 1.00. A token that would share fees is worth more.' })),
        el('li', null, el('b', { text: '5 · Chain count — +0.02 a chain, up to \u00d7 1.10' }), el('span', { text: 'Each chain past the first adds 0.02, capped after five. Wider reach is worth a little more.' }))
      ),
      el('div', { class: 'worked' },
        el('h3', { text: 'Worked example — #1 ' + top.name }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL ' + fmtUsd(top.tvl_usd) + ' \u00d7 ' + m.base_multiple }), el('b', { class: 'num', text: fmtUsd(base) })),
          el('div', null, el('span', { text: 'Seven-day growth ' + fmtPct(top.change_7d) + ' \u2192 \u00d7 ' + growthMult.toFixed(3) }), el('b', { class: 'num', text: fmtUsd(base * growthMult) })),
          el('div', null, el('span', { text: 'Age ' + fmtAge(top.age_days) + ' with no token \u2192 \u00d7 ' + maturity.toFixed(3) }), el('b', { class: 'num', text: fmtUsd(base * growthMult * maturity) })),
          el('div', null, el('span', { text: 'Category ' + (top.category || 'Other') + ' \u2192 \u00d7 ' + top.category_multiplier }), el('b', { class: 'num', text: fmtUsd(base * growthMult * maturity * top.category_multiplier) })),
          el('div', null, el('span', { text: chainNote + ' \u2192 \u00d7 ' + top.chains_multiplier }), el('b', { class: 'num', text: fmtUsd(recomputed) })),
          el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(top.implied_value_usd) }))
        ),
        el('p', { class: 'sub', text: 'The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === top.implied_value_usd ? ', the same number the board carries.' : ', which differs from the board — the data would be stale.') + ' Implied value is this entry\u2019s own estimate, not a price and not a promise that a token launches.' })
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' — WATCHLIST' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · records no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Category multiplier' }), el('b', { class: 'num', text: String(row.category_multiplier) })),
        el('div', null, el('span', { text: 'Chains multiplier' }), el('b', { class: 'num', text: String(row.chains_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('div', { class: 'note' },
      el('b', { text: 'Records no token. ' }),
      'DefiLlama records no token for this protocol, which is not proof it has none. Never pay to claim an airdrop, and never share a seed phrase.'
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'live') shell.appendChild(liveTable());
    else if (state.tab === 'set-aside') shell.appendChild(setAsidePanel());
    else {
      var explainer = explainerPanel();
      if (explainer) shell.appendChild(explainer);
      shell.appendChild(boardTable());
    }
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('span', { text: 'Source: ' + DATA.source }),
      el('span', { text: 'Snapshot ' + DATA.as_of + ' · ' + DATA.model_version + ' model · Implied values are the entry\u2019s own claim, not a price and not a prediction of a launch.' })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
