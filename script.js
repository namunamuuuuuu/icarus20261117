(() => {
  'use strict';
  const STORAGE_KEY = 'yohaku_notes_v1';
  const $ = id => document.getElementById(id);
  const els = {
    list: $('list-view'), read: $('read-view'), editor: $('editor-view'), settings: $('settings-view'),
    grid: $('notes-grid'), empty: $('empty-state'), search: $('search-input'), sort: $('sort-select'),
    categoryNav: $('category-nav'), chips: $('filter-chips'), breadcrumb: $('breadcrumb-current'),
    title: $('note-title'), excerpt: $('note-excerpt'), category: $('note-category'),
    tags: $('note-tags'), content: $('note-content'), preview: $('note-preview'),
    status: $('save-status'), toast: $('toast'), sidebar: document.querySelector('.sidebar')
  };
  let notes = load();
  let view = 'home', categoryFilter = 'すべて', editingId = null, readingId = null;
  let original = '', dirty = false, toastTimeout;

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function safeURL(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return ['https:', 'http:', 'mailto:'].includes(parsed.protocol) ? parsed.href : '#';
    } catch { return '#'; }
  }
  function markdown(source) {
    // Escape untrusted HTML before applying the limited Markdown syntax.
    const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
    let html = '', paragraph = [], listType = '', quote = [];
    const inline = text => {
      let t = escapeHTML(text);
      const links = [];
      t = t.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
        const token = `@@LINK${links.length}@@`;
        links.push(`<a href="${escapeHTML(safeURL(url.replaceAll('&amp;', '&')))}" target="_blank" rel="noopener noreferrer">${label}</a>`);
        return token;
      });
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
           .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
           .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      return t.replace(/@@LINK(\d+)@@/g, (_, n) => links[Number(n)]);
    };
    function flushParagraph() { if (paragraph.length) { html += `<p>${paragraph.map(inline).join('<br>')}</p>`; paragraph = []; } }
    function flushList() { if (listType) { html += `</${listType}>`; listType = ''; } }
    function flushQuote() { if (quote.length) { html += `<blockquote>${quote.map(inline).join('<br>')}</blockquote>`; quote = []; } }
    for (const line of lines) {
      const trim = line.trim();
      if (!trim) { flushParagraph(); flushList(); flushQuote(); continue; }
      if (/^>\s?/.test(trim)) { flushParagraph(); flushList(); quote.push(trim.replace(/^>\s?/, '')); continue; }
      flushQuote();
      const heading = trim.match(/^(#{1,3})\s+(.+)$/);
      if (heading) { flushParagraph(); flushList(); html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`; continue; }
      if (/^(-{3,}|\*{3,})$/.test(trim)) { flushParagraph(); flushList(); html += '<hr>'; continue; }
      const unordered = trim.match(/^[-*+]\s+(.+)$/);
      const ordered = trim.match(/^\d+\.\s+(.+)$/);
      if (unordered || ordered) {
        flushParagraph();
        const nextType = unordered ? 'ul' : 'ol';
        if (listType !== nextType) { flushList(); listType = nextType; html += `<${listType}>`; }
        html += `<li>${inline((unordered || ordered)[1])}</li>`;
        continue;
      }
      flushList(); paragraph.push(trim);
    }
    flushParagraph(); flushList(); flushQuote();
    return html || '<p>本文はまだありません。</p>';
  }
  function validNote(obj) {
    if (!obj || typeof obj !== 'object' || typeof obj.title !== 'string' || typeof obj.content !== 'string') return null;
    const now = new Date().toISOString();
    return {
      id: typeof obj.id === 'string' && obj.id.length < 100 ? obj.id : makeId(),
      title: obj.title.slice(0, 140), excerpt: String(obj.excerpt ?? '').slice(0, 220),
      category: String(obj.category ?? 'その他').slice(0, 40),
      tags: Array.isArray(obj.tags) ? obj.tags.filter(x => typeof x === 'string').slice(0, 20).map(x => x.slice(0, 40)) : [],
      content: obj.content.slice(0, 300000), status: obj.status === 'published' ? 'published' : 'draft',
      favorite: obj.favorite === true,
      createdAt: Number.isFinite(Date.parse(obj.createdAt)) ? obj.createdAt : now,
      updatedAt: Number.isFinite(Date.parse(obj.updatedAt)) ? obj.updatedAt : now
    };
  }
  function load() {
    try { const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(data) ? data.map(validNote).filter(Boolean) : []; }
    catch { return []; }
  }
  function persist(next) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); notes = next; return true; }
    catch { notify('保存に失敗しました。ブラウザの空き容量・設定を確認してください。'); return false; }
  }
  function makeId() { return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `note-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function date(value) { return new Date(value).toLocaleDateString('ja-JP', {year:'numeric',month:'2-digit',day:'2-digit'}); }
  function notify(message) {
    els.toast.textContent = message; els.toast.classList.add('show');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => els.toast.classList.remove('show'), 3300);
  }
  function show(name, crumb) {
    [els.list, els.read, els.editor, els.settings].forEach(node => node.classList.add('hidden'));
    ({list:els.list, read:els.read, editor:els.editor, settings:els.settings})[name].classList.remove('hidden');
    els.breadcrumb.textContent = crumb;
    els.sidebar.classList.remove('open');
    window.scrollTo(0, 0);
  }
  function updateCounts() {
    $('all-count').textContent = notes.length;
    $('draft-count').textContent = notes.filter(n => n.status === 'draft').length;
    $('footer-year').textContent = new Date().getFullYear();
  }
  function renderNavigation() {
    document.querySelectorAll('#navigation [data-view]').forEach(button => button.classList.toggle('active', view === button.dataset.view));
    const categories = [...new Set(notes.map(n => n.category))].sort((a, b) => a.localeCompare(b, 'ja'));
    els.categoryNav.replaceChildren();
    for (const category of categories) {
      const button = document.createElement('button'); button.className = `nav-item${view === 'category' && categoryFilter === category ? ' active' : ''}`;
      button.textContent = category;
      button.addEventListener('click', () => { view = 'category'; categoryFilter = category; renderList(); });
      els.categoryNav.append(button);
    }
  }
  function renderChips() {
    els.chips.replaceChildren();
    const categories = ['すべて', ...new Set(notes.map(n => n.category))];
    for (const name of categories) {
      const chip = document.createElement('button');
      chip.className = `chip${categoryFilter === name ? ' active' : ''}`; chip.textContent = name;
      chip.addEventListener('click', () => { categoryFilter = name; if (view === 'category') view = 'home'; renderList(); });
      els.chips.append(chip);
    }
  }
  function renderList() {
    updateCounts(); renderNavigation(); renderChips();
    const labels = {home:'すべての文章', favorites:'お気に入り', drafts:'下書き', category:categoryFilter};
    const label = labels[view] || labels.home;
    $('list-heading').textContent = label + ' ';
    const resultCount = document.createElement('span'); resultCount.id = 'result-count'; resultCount.className = 'light-number'; $('list-heading').append(resultCount);
    const q = els.search.value.trim().toLocaleLowerCase('ja');
    let filtered = notes.filter(n => {
      if (view === 'favorites' && !n.favorite) return false;
      if (view === 'drafts' && n.status !== 'draft') return false;
      if (view === 'category' && n.category !== categoryFilter) return false;
      if (view !== 'category' && categoryFilter !== 'すべて' && n.category !== categoryFilter) return false;
      return !q || [n.title,n.excerpt,n.content,n.category,...n.tags].join(' ').toLocaleLowerCase('ja').includes(q);
    });
    if (els.sort.value === 'oldest') filtered.sort((a,b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
    else if (els.sort.value === 'title') filtered.sort((a,b) => a.title.localeCompare(b.title, 'ja'));
    else filtered.sort((a,b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    resultCount.textContent = filtered.length;
    els.grid.replaceChildren();
    for (const note of filtered) {
      const card = document.createElement('article'); card.className = 'note-card'; card.tabIndex = 0; card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${note.title}を読む`);
      const intro = note.excerpt || note.content.replace(/[#*`_>\[\]()]/g, '').slice(0, 110);
      card.innerHTML = `<div class="card-top"><span class="category-label">${escapeHTML(note.category)}</span><span class="card-date">${date(note.updatedAt)}</span></div><h3>${escapeHTML(note.title)}</h3><p>${escapeHTML(intro)}</p><div class="card-bottom"><div class="tag-list">${note.tags.slice(0,3).map(t=>`<span>#${escapeHTML(t)}</span>`).join('')}</div><span class="favorite-icon">${note.favorite ? '♥' : note.status === 'draft' ? '下書き' : '↗'}</span></div>`;
      card.addEventListener('click', () => openRead(note.id));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRead(note.id); } });
      els.grid.append(card);
    }
    els.empty.classList.toggle('hidden', filtered.length > 0);
    show('list', label);
  }
  function openRead(id) {
    const note = notes.find(n => n.id === id); if (!note) return renderList();
    readingId = id;
    $('reader-meta').textContent = `${note.category}  /  ${date(note.createdAt)}  /  ${note.status === 'draft' ? '下書き' : '公開状態'}`;
    $('reader-title').textContent = note.title;
    $('reader-excerpt').textContent = note.excerpt;
    $('reader-body').innerHTML = markdown(note.content);
    $('reader-tags').replaceChildren();
    note.tags.forEach(tag => { const span = document.createElement('span'); span.textContent = `#${tag}`; $('reader-tags').append(span); });
    $('reader-favorite').textContent = note.favorite ? '♥ お気に入り解除' : '♡ お気に入り';
    show('read', note.title);
  }
  function values() { return {
    title: els.title.value.trim(), excerpt: els.excerpt.value.trim(), category: els.category.value,
    tags: [...new Set(els.tags.value.split(/[,、]/).map(x => x.trim()).filter(Boolean))].slice(0,20), content: els.content.value
  }; }
  function takeSnapshot() { return JSON.stringify(values()); }
  function markDirty() { dirty = takeSnapshot() !== original; els.status.textContent = dirty ? '未保存の変更あり' : '保存済み'; $('word-count').textContent = `${els.content.value.length} 文字`; }
  function resetEditor(note) {
    editingId = note ? note.id : null;
    els.title.value = note?.title || ''; els.excerpt.value = note?.excerpt || '';
    els.category.value = note?.category || '日記';
    if (note && els.category.value !== note.category) {
      const option = new Option(note.category, note.category); els.category.add(option); els.category.value = note.category;
    }
    els.tags.value = note?.tags.join(', ') || ''; els.content.value = note?.content || '';
    $('delete-note').classList.toggle('hidden', !note);
    document.querySelector('.editor-header h1').textContent = note ? '文章を編集' : '新しい文章';
    chooseTab('write'); original = takeSnapshot(); dirty = false; els.status.textContent = note ? '保存済み' : '未保存';
    $('word-count').textContent = `${els.content.value.length} 文字`;
    show('editor', note ? '文章を編集' : '新しい文章');
  }
  function chooseTab(name) {
    $('tab-write').classList.toggle('active', name === 'write'); $('tab-preview').classList.toggle('active', name === 'preview');
    els.content.classList.toggle('hidden', name !== 'write'); els.preview.classList.toggle('hidden', name !== 'preview');
    if (name === 'preview') els.preview.innerHTML = markdown(els.content.value);
  }
  function leaveEditor() { if (dirty && !confirm('未保存の変更があります。破棄して一覧に戻りますか？')) return; dirty = false; renderList(); }
  function save(status) {
    const v = values(); if (!v.title) { els.title.focus(); notify('タイトルを入力してください。'); return; }
    const now = new Date().toISOString(), before = notes.find(n => n.id === editingId);
    const note = {...v, id: before?.id || makeId(), status, favorite: before?.favorite || false, createdAt: before?.createdAt || now, updatedAt: now};
    const next = before ? notes.map(n => n.id === editingId ? note : n) : [...notes,note];
    if (!persist(next)) return;
    dirty = false; original = takeSnapshot(); editingId = note.id;
    notify(status === 'draft' ? '下書きを保存しました' : '公開状態で保存しました（この端末内のみ）'); openRead(note.id);
  }
  function createDownload(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], {type}));
    const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.querySelectorAll('#navigation [data-view]').forEach(button => button.addEventListener('click', () => {
    view = button.dataset.view; categoryFilter = 'すべて'; renderList();
  }));
  ['new-note-top', 'new-note-hero', 'empty-create'].forEach(id => $(id).addEventListener('click', () => resetEditor(null)));
  els.search.addEventListener('input', renderList);
  els.sort.addEventListener('change', renderList);
  $('read-back').addEventListener('click', renderList);
  $('reader-edit').addEventListener('click', () => resetEditor(notes.find(n => n.id === readingId)));
  $('reader-favorite').addEventListener('click', () => {
    const next = notes.map(n => n.id === readingId ? {...n, favorite: !n.favorite} : n);
    if (persist(next)) openRead(readingId);
  });
  $('editor-back').addEventListener('click', leaveEditor);
  $('note-form').addEventListener('submit', event => event.preventDefault());
  [els.title, els.excerpt, els.category, els.tags, els.content].forEach(el => {
    el.addEventListener('input', markDirty); el.addEventListener('change', markDirty);
  });
  $('tab-write').addEventListener('click', () => chooseTab('write'));
  $('tab-preview').addEventListener('click', () => chooseTab('preview'));
  $('save-draft').addEventListener('click', () => save('draft'));
  $('publish-note').addEventListener('click', () => save('published'));
  $('delete-note').addEventListener('click', () => {
    if (!editingId || !confirm('この文章を完全に削除しますか？')) return;
    if (persist(notes.filter(n => n.id !== editingId))) { dirty = false; notify('文章を削除しました'); renderList(); }
  });
  $('open-settings').addEventListener('click', () => show('settings', 'データ管理'));
  $('settings-back').addEventListener('click', renderList);
  $('export-data').addEventListener('click', () => {
    createDownload(`yohaku-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(notes, null, 2), 'application/json;charset=utf-8');
    notify('バックアップをダウンロードしました');
  });
  $('import-data').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 10_000_000) throw new Error('ファイルが大きすぎます');
      const incoming = JSON.parse(await file.text());
      if (!Array.isArray(incoming) || incoming.length > 10000 || incoming.some(item => !item || typeof item.title !== 'string' || typeof item.content !== 'string')) throw new Error('このアプリのバックアップJSONではありません');
      const map = new Map(notes.map(n => [n.id, n]));
      incoming.map(validNote).forEach(n => map.set(n.id,n));
      if (!confirm(`${incoming.length}件の文章を読み込みます。同じIDの文章は上書きされます。続けますか？`)) return;
      if (persist([...map.values()])) { notify('バックアップを読み込みました'); renderList(); }
    } catch (err) { notify(`読み込みに失敗しました：${err.message}`); }
    finally { event.target.value = ''; }
  });
  $('mobile-menu').addEventListener('click', () => els.sidebar.classList.toggle('open'));
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  updateCounts(); renderList();
})();
