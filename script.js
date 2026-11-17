(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { notes: [], category: 'すべて' };
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safeURL(value) {
    try {
      const url = new URL(value, location.href);
      return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : '#';
    } catch { return '#'; }
  }
  function inline(text) {
    const links = [];
    let html = escapeHTML(text).replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, title, href) => {
      const token = `@@LINK${links.length}@@`;
      links.push(`<a href="${escapeHTML(safeURL(href.replaceAll('&amp;', '&')))}" rel="noopener noreferrer" target="_blank">${title}</a>`);
      return token;
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    return html.replace(/@@LINK(\d+)@@/g, (_, idx) => links[Number(idx)]);
  }
  function markdown(source) {
    const lines = String(source || '').replace(/\r\n?/g,'\n').split('\n');
    let output = '', para = [], list = '', quote = [];
    const flush = () => {
      if (para.length) { output += `<p>${para.map(inline).join('<br>')}</p>`; para=[]; }
      if (list) { output += `</${list}>`; list=''; }
      if (quote.length) { output += `<blockquote>${quote.map(inline).join('<br>')}</blockquote>`; quote=[]; }
    };
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { flush(); continue; }
      if (/^>\s?/.test(trimmed)) {
        if (para.length || list) flush();
        quote.push(trimmed.replace(/^>\s?/, ''));
        continue;
      }
      if (quote.length) flush();
      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
      const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
      if (heading) { flush(); output += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`; }
      else if (/^(-{3,}|\*{3,})$/.test(trimmed)) { flush(); output += '<hr>'; }
      else if (unordered || ordered) {
        if (para.length) flush();
        const kind = unordered ? 'ul' : 'ol';
        if (list !== kind) { flush(); output += `<${kind}>`; list = kind; }
        output += `<li>${inline((unordered || ordered)[1])}</li>`;
      } else { if (list) flush(); para.push(trimmed); }
    }
    flush();
    return output || '<p>本文はまだありません。</p>';
  }
  function normalizeNote(note) {
    if (!note || typeof note !== 'object' || typeof note.title !== 'string' || typeof note.content !== 'string') return null;
    return {
      id: String(note.id || ''), title: note.title.slice(0,140), content: note.content.slice(0,300000),
      excerpt: String(note.excerpt || '').slice(0,220), category: String(note.category || 'その他').slice(0,40),
      tags: Array.isArray(note.tags) ? note.tags.filter(t=>typeof t==='string').slice(0,20) : [],
      createdAt: note.createdAt || '', updatedAt: note.updatedAt || ''
    };
  }
  function formattedDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ja-JP', {year:'numeric',month:'2-digit',day:'2-digit'});
  }
  function show(view, label) {
    $('list-view').classList.toggle('hidden', view !== 'list');
    $('read-view').classList.toggle('hidden', view !== 'read');
    $('breadcrumb-current').textContent = label;
    document.querySelector('.sidebar').classList.remove('open');
    scrollTo(0,0);
  }
  function nav() {
    const categories = [...new Set(state.notes.map(note=>note.category))].sort((a,b)=>a.localeCompare(b,'ja'));
    const categoryNav=$('category-nav'); const chips=$('filter-chips');
    categoryNav.replaceChildren(); chips.replaceChildren();
    for (const category of ['すべて',...categories]) {
      const chip = document.createElement('button');
      chip.type='button'; chip.className = `chip${state.category===category?' active':''}`;
      chip.textContent=category; chip.addEventListener('click',()=>{state.category=category;renderList();});
      chips.append(chip);
      if (category==='すべて') continue;
      const button=document.createElement('button'); button.type='button';
      button.className=`nav-item${state.category===category?' active':''}`; button.textContent=category;
      button.addEventListener('click',()=>{state.category=category;renderList();}); categoryNav.append(button);
    }
    document.querySelector('[data-view="home"]').classList.toggle('active',state.category==='すべて');
  }
  function renderList() {
    nav(); $('all-count').textContent=state.notes.length;
    const label=state.category==='すべて'?'すべての文章':state.category;
    const heading=$('list-heading'); heading.replaceChildren(document.createTextNode(label+' '));
    const count=document.createElement('span'); count.className='light-number'; count.id='result-count'; heading.append(count);
    const query=$('search-input').value.trim().toLocaleLowerCase('ja');
    const filtered=state.notes.filter(note=>(state.category==='すべて'||note.category===state.category)
      &&(!query||[note.title,note.excerpt,note.category,note.content,...note.tags].join(' ').toLocaleLowerCase('ja').includes(query)));
    const sort=$('sort-select').value;
    filtered.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'ja'):sort==='oldest'
      ? Date.parse(a.updatedAt||0)-Date.parse(b.updatedAt||0):Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0));
    count.textContent=filtered.length;
    const grid=$('notes-grid'); grid.replaceChildren();
    for (const note of filtered) {
      const card=document.createElement('article'); card.className='note-card'; card.tabIndex=0;
      card.setAttribute('role','button'); card.setAttribute('aria-label',`${note.title}を読む`);
      const excerpt=note.excerpt||note.content.replace(/[#*`_>\[\]()]/g,'').slice(0,110);
      card.innerHTML=`<div class="card-top"><span class="category-label">${escapeHTML(note.category)}</span><span class="card-date">${escapeHTML(formattedDate(note.updatedAt))}</span></div><h3>${escapeHTML(note.title)}</h3><p>${escapeHTML(excerpt)}</p><div class="card-bottom"><div class="tag-list">${note.tags.slice(0,3).map(tag=>`<span>#${escapeHTML(tag)}</span>`).join('')}</div><span>読む ↗</span></div>`;
      card.addEventListener('click',()=>openArticle(note.id));
      card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openArticle(note.id);}});
      grid.append(card);
    }
    $('empty-state').classList.toggle('hidden',filtered.length!==0);
    show('list',label);
  }
  function openArticle(id) {
    const note=state.notes.find(n=>n.id===id); if(!note)return;
    $('reader-meta').textContent=`${note.category} / ${formattedDate(note.createdAt)}`;
    $('reader-title').textContent=note.title; $('reader-excerpt').textContent=note.excerpt;
    $('reader-body').innerHTML=markdown(note.content);
    const tags=$('reader-tags');tags.replaceChildren();
    for(const tag of note.tags){const span=document.createElement('span');span.textContent=`#${tag}`;tags.append(span);}
    location.hash=`note/${encodeURIComponent(note.id)}`;
    show('read',note.title);
  }
  function handleHash() {
    const match=location.hash.match(/^#note\/(.+)$/);
    if(match){try {openArticle(decodeURIComponent(match[1]));return;}catch{}}
    renderList();
  }
  $('search-input').addEventListener('input',renderList);
  $('sort-select').addEventListener('change',renderList);
  $('read-back').addEventListener('click',()=>{location.hash='home';renderList();});
  document.querySelector('[data-view="home"]').addEventListener('click',()=>{state.category='すべて';location.hash='home';renderList();});
  $('mobile-menu').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('.sidebar').classList.remove('open');});
  document.addEventListener('click',e=>{if(!e.target.closest('.sidebar')&&!e.target.closest('#mobile-menu'))document.querySelector('.sidebar').classList.remove('open');});
  window.addEventListener('hashchange',handleHash);
  $('footer-year').textContent=new Date().getFullYear();
  fetch('./public-notes.json',{cache:'no-store'})
    .then(response=>{if(!response.ok)throw new Error('記事を取得できません');return response.json();})
    .then(data=>{
      if(!Array.isArray(data))throw new Error('記事形式が違います');
      state.notes=data.filter(n=>n&&n.status!=='draft').map(normalizeNote).filter(Boolean).slice(0,10000);
      handleHash();
    })
    .catch(error=>{
      $('empty-state').querySelector('h3').textContent='記事を読み込めませんでした';
      $('empty-state').querySelector('p').textContent='ページを再読み込みしてください。';
      console.error('記事の読み込みエラー:',error);
      renderList();
    });
})();
