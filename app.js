/* ============ 1. DATOS NORMATIVOS (editar aquí para ampliar) ============ */
const STD_KVA = [15,25,30,37.5,45,50,75,100,112.5,150,225,250,300,400,500,630,750,1000];
const FUSE_K  = [1,2,3,5,6,8,10,12,15,20,25,30,40,50,65,80,100,140,200];
// NTT-01 Tabla 2: poste según potencia (h = límite superior exclusivo)
const POSTE = [{h:112.5,peso:600,rot:510},{h:150.01,peso:700,rot:750},{h:250.01,peso:800,rot:1050}];
// NTT-02 Tabla 2 (13,2 kV, delta): [kVA máx, Bay-O-Net, limitador] opción 1
const PEDESTAL_FUSE = [[45,'C03','30 A'],[75,'C05','30 A'],[112.5,'C05','30 A'],[300,'C08','80 A'],[500,'C10','100 A'],[630,'C12','150 A']];
// NTT-03 Fig. 7: [kVA máx, lado A, lado B] del local en metros
const LOCAL = [[75,1.5,1.5],[250,2,2],[400,2.5,2],[630,2.5,2.5],[1000,3.1,2.5]];

/* ============ 2. FORMULARIO (se genera desde esta lista) ============ */
const FIELDS = [
 {id:'kva', l:'Potencia nominal', u:'kVA', min:15, max:1000, step:5, v:150},
 {id:'dem', l:'Demanda máxima', u:'kVA', min:5, max:1200, step:5, v:120},
 {id:'peso',l:'Peso del equipo', u:'kg', min:100, max:3000, step:10, v:700},
 {id:'dist',l:'Distancia a edificación', u:'m', min:0, max:30, step:.5, v:5},
 {id:'vp', l:'Tensión primaria', sel:[[13.2,'13,2 kV'],[34.5,'34,5 kV']]},
 {id:'ph', l:'Fases', sel:[[3,'Trifásico'],[1,'Monofásico']]},
 {id:'vs', l:'Tensión secundaria (línea)', sel:[[208,'208 V'],[220,'220 V'],[440,'440 V'],[240,'240 V (monofásico)']]},
 {id:'oil',l:'Dieléctrico', sel:[['oil','Aceite mineral'],['dry','Seco']]},
 {id:'res',l:'Carga residencial', chk:1},
 {id:'bt', l:'Medida en baja tensión', chk:1, on:1},
 {id:'ped',l:'Ruta peatonal obligada o andén', chk:1},
 {id:'occ',l:'Local en piso superior a zonas habitadas', chk:1},
 {id:'coast',l:'Zona costera o contaminada', chk:1}
];
const $ = id => document.getElementById(id);

function buildForm(FIELDS, formId, onChange){
  $(formId).innerHTML = FIELDS.map(f => {
    if (f.chk) return `<label class="chk"><input type="checkbox" id="${f.id}" ${f.on?'checked':''}>${f.l}</label>`;
    if (f.sel) return `<div class="f"><label for="${f.id}">${f.l}</label><select id="${f.id}">${f.sel.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('')}</select></div>`;
    return `<div class="f"><label>${f.l}<small>${f.u}</small></label><div class="row">
      <input type="range" data-pair="${f.id}" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.v}" aria-label="${f.l}">
      <input type="number" id="${f.id}" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.v}"></div></div>`;
  }).join('');
  // Sincroniza barra y casilla numérica, y recalcula todo
  $(formId).addEventListener('input', e => {
    const p = e.target.dataset.pair;
    if (p) $(p).value = e.target.value;
    else { const r = document.querySelector(`[data-pair="${e.target.id}"]`); if (r) r.value = e.target.value; }
    onChange();
  });
}
// Lee los valores actuales como objeto { kva:150, res:false, ... }
const read = FIELDS => Object.fromEntries(FIELDS.map(f => {
  const el = $(f.id); if (f.chk) return [f.id, el.checked];
  const n = parseFloat(el.value); return [f.id, isNaN(n) ? el.value : n];
}));

/* ============ 3. CÁLCULOS ELÉCTRICOS ============ */
function calc(d){
  const k = d.ph === 3 ? Math.sqrt(3) : 1;
  const i1 = d.kva / (k * d.vp);               // A primarios (kVA / kV)
  const i2 = d.kva * 1000 / (k * d.vs);        // A secundarios
  const fk = FUSE_K.reduce((a,b) => Math.abs(b-i1) < Math.abs(a-i1) ? b : a); // fusible K más próximo (NTT-01 5.h)
  const cap = d.kva * (d.res ? 1.25 : 1);      // sobrecarga residencial 25 % por 4 h (NTT-01 5.f)
  const next = STD_KVA.find(s => s >= d.dem / 0.8) || 1000; // criterio de diseño: ≤80 % de uso
  return {i1, i2, fk, cap, next, util: d.dem / d.kva * 100};
}

/* ============ 4. HIPÓTESIS (cada una devuelve verificaciones y consejos) ============ */
// Estados: ok = cumple · warn = condicionado · bad = incumple · req = requisito a construir
const chk = (c, t, f, lvl='bad') => ({s: c ? 'ok' : lvl, t: c ? t : f});
const req = t => ({s:'req', t});

function evalPoste(d,c){
  const p = POSTE.find(r => d.kva < r.h) || POSTE[2];
  const k = [
    chk(d.kva<=250, 'Potencia ≤ 250 kVA (RETIE 24.3)', 'Supera 250 kVA: el RETIE 24.3 no admite subestación tipo poste'),
    chk(d.peso<=p.peso, `Peso ≤ ${p.peso} kg (Tabla 2, NTT‑01)`, `Peso mayor a ${p.peso} kg permitidos para esta potencia`),
    d.ph===3 && chk(d.kva<=150 && d.peso<750, 'Trifásico dentro de 150 kVA y menos de 750 kg', 'Trifásico en poste: la nota 5 de NTT‑01 limita a 150 kVA y menos de 750 kg','warn'),
    d.kva>150 && chk(d.dist>=2.3, 'Distancia a edificación ≥ 2,3 m', 'Para 250 kVA se exige ≥ 2,3 m a la edificación'),
    d.kva>150 && chk(d.bt, 'Medida en baja tensión', 'A 250 kVA todas las instalaciones deben medirse en baja tensión'),
    d.kva>150 && chk(!d.ped, 'No afecta tránsito peatonal', 'A 250 kVA no se permite en andenes ni espacios peatonales'),
    chk(d.oil==='oil', 'Transformador sumergido en aceite', 'La norma de poste contempla equipos en aceite','warn')
  ].filter(Boolean);
  const tips = [
    ['NTT‑01 5.b', `Poste de 12 m con rotura mínima de ${p.rot} kgf.`],
    ['NTT‑01 5.h', `Cortacircuito con fusible tipo K de ${c.fk} A (el normalizado más cercano a ${c.i1.toFixed(1)} A).`],
    ['NTT‑01 5.e, 5.l', 'Instale el DPS sobre el tanque y use bajante en cable semiaislado.']
  ];
  if (d.kva>75) tips.push(['NTT‑01 5.i','Sobre 75 kVA el cortacircuito lleva cámara apagachispa.']);
  if (d.coast) tips.push(['NTT‑01 nota 2','En zona costera use poste de poliéster reforzado con fibra de vidrio.']);
  return {n:'H1 · Subestación tipo poste', k, tips};
}

function evalPedestal(d,c){
  const f = PEDESTAL_FUSE.find(r => d.kva <= r[0]);
  const k = [
    chk(d.ph===3, 'Trifásico, como contempla NTT‑02', 'NTT‑02 trata equipos trifásicos', 'warn'),
    chk(d.oil==='oil', 'Sumergido en líquido refrigerante', 'El alcance de NTT‑02 es sumergido en líquido'),
    chk(!d.ped, 'Fuera de rutas peatonales obligadas', 'No puede ubicarse en rutas peatonales obligadas (5.1.p)'),
    chk(d.dist>=2, 'A ≥ 2 m de puertas y ventanas', 'Debe quedar a ≥ 2 m de puertas y ventanas (Fig. 4)'),
    d.kva>630 && chk(false, '', 'Sobre 630 kVA no hay fusibles de referencia: requiere aval del fabricante','warn'),
    d.kva>=112.5 ? req('Foso y trampa de aceite para el 100 % del volumen') :
      req(d.dist>20 ? 'Zanja de 200×500 mm con grava y plan de contingencias' : 'Foso y trampa de aceite (a menos de 20 m de edificación)'),
    d.kva>150 && req('Interruptor general en BT con disparo tripolar si no hay seccionador en celda'),
    d.kva>250 && (d.res ? chk(false,'','Sobre 250 kVA tipo patio se limita a usos no residenciales','warn')
                        : req('Si es tipo patio: cerca de 2,5 m, foso al 75 % y pórtico de 10 m'))
  ].filter(Boolean);
  const tips = [
    ['NTT‑02 5.1.i', 'Malla de puesta a tierra diseñada según el artículo 15 del RETIE por profesional competente.'],
    ['NTT‑02 5.1.q', 'Deje espacio para DPS tipo codo junto a los bujes primarios (RETIE 20.14.2).'],
    ['NTT‑02 6.1.e', 'Base de concreto nivelada: máximo 2° de inclinación.'],
    ['NTT‑02 6.1.c', 'Si la superficie supera 45 °C sobre la ambiente, instale cerramiento de 1,5 m con acceso a 1,5 m del frente.']
  ];
  if (f) tips.unshift(['NTT‑02 Tabla 2', `Fusible Bay‑O‑Net ${f[1]} con limitador de ${f[2]} (opción 1, 13,2 kV delta).`]);
  return {n:'H2 · Pedestal (pad mounted)', k, tips};
}

function evalInterior(d,c){
  const rec = d.kva<=500 ? 13.2 : 34.5, L = LOCAL.find(r => d.kva <= r[0]) || LOCAL[4];
  const k = [
    chk(d.vp===rec, 'Tensión primaria coherente con la Tabla 4', `La Tabla 4 prevé ${rec===13.2?'13,2':'34,5'} kV para esta potencia (excepción: aprobación ESSA)`,'warn'),
    (d.vp===34.5 || d.kva>500) && req('Recloser en el punto de derivación de la acometida'),
    d.oil==='oil' ? req('Bóveda de 3 h al fuego, puerta cortafuego, ventilación con compuerta y foso de aceite')
                  : (d.kva>=112.5 ? req('Seco ≥ 112,5 kVA: bóveda de 1 h o celda metálica según el RISE') : null),
    d.oil==='oil' && chk(!d.occ, 'Piso no superior a zonas habitadas', 'Un equipo en aceite no puede ir sobre habitaciones u oficinas'),
    req(`Local mínimo ${L[1]}×${L[2]} m, altura ≥ 2,5 m y área sugerida ≥ 12 m²`),
    !d.bt && req('Medida en MT: módulo para CT y PT sellable por ESSA'),
    req('Iluminación ≥ 100 lux con interruptor junto a la puerta')
  ].filter(Boolean);
  const tips = [
    ['NTT‑03 6.5', 'Malla bajo la subestación: 4 varillas copperweld y cobre desnudo mínimo 2 AWG, antes de fundir la placa.'],
    ['NTT‑03 6.5', 'DPS en los bujes primarios con conductores de 6 AWG o más, a tierra sin pasar por la barra de la celda.'],
    ['NTT‑03 6.4', 'Seccionador tripolar bajo carga con fusibles HH y enclavamiento mecánico con la puerta.'],
    ['NTT‑03 6.3', 'Celda con grado de protección IP20 o superior, sin rejillas en la parte superior y con zapatas de caucho en la base.']
  ];
  return {n:'H3 · Subestación interior', k, tips};
}

/* ============ 5. RENDER ============ */
const ICON = {ok:'✔', warn:'▲', bad:'✖', req:'◆'};
const fmt = (n,x=1) => n.toLocaleString('es-CO',{maximumFractionDigits:x});

function update(){
  const d = read(FIELDS), c = calc(d);
  // Evalúa y puntúa las tres hipótesis (incumple −40, condicionado −10)
  const hs = [evalPoste, evalPedestal, evalInterior].map(fn => {
    const h = fn(d,c), f = h.k.filter(x=>x.s==='bad').length, w = h.k.filter(x=>x.s==='warn').length;
    return {...h, score: Math.max(0, 100-40*f-10*w), v: f ? ['No cumple','bad'] : w ? ['Cumple con condiciones','warn'] : ['Cumple','ok']};
  });
  const best = hs.reduce((a,b) => b.score > a.score ? b : a);

  const col = c.util > 100 ? 'var(--bad)' : c.util > 80 ? 'var(--warn)' : 'var(--ok)';
  $('kpis').innerHTML = `
    <div class="kpi" title="I = S / (√3·V primaria)"><b>${fmt(c.i1)} A</b><span>Corriente primaria</span></div>
    <div class="kpi" title="I = S / (√3·V secundaria)"><b>${fmt(c.i2,0)} A</b><span>Corriente secundaria</span></div>
    <div class="kpi" title="Fusible tipo K normalizado más cercano a la corriente nominal (NTT-01 5.h)"><b>K ${c.fk}</b><span>Fusible de cortacircuito</span></div>
    <div class="kpi" title="Demanda máxima / potencia nominal"><b>${fmt(c.util,0)} %</b><span>Utilización</span>
      <div class="bar"><i style="width:${Math.min(c.util,100)}%;background:${col}"></i></div></div>`;

  const a = d.dem > c.cap ? ['bad', `La demanda (${fmt(d.dem)} kVA) supera la capacidad admisible de ${fmt(c.cap)} kVA. Pase al menos a ${c.next} kVA.`]
    : d.dem > d.kva ? ['warn','Sobrecarga tolerada solo en cargas residenciales: 125 % durante 4 h (NTT‑01 5.f).']
    : c.util < 40 ? ['warn',`Equipo subutilizado: sus pérdidas en vacío (NTC 818 y 819) pesan más. Pruebe con ${c.next} kVA.`]
    : ['ok','La demanda cabe dentro de la capacidad nominal.'];
  $('alert').innerHTML = `<div class="alert ${a[0]} t" style="border-color:var(--${a[0]})"><span style="color:var(--ink)">${a[1]}</span></div>`;

  $('hyp').innerHTML = hs.map(h => `
    <article class="card ${h===best?'best':''}">
      <div class="head"><h3 style="font-size:1.05rem">${h.n}</h3>${h===best?'<span class="badge" style="color:var(--acc)">Recomendada</span>':''}</div>
      <p class="${h.v[1]} t" style="margin:.4rem 0 0"><b>${h.v[0]}</b> · puntaje ${h.score}/100</p>
      <ul>${h.k.map(x=>`<li class="${x.s}"><b>${ICON[x.s]}</b><span>${x.t}</span></li>`).join('')}</ul>
    </article>`).join('');

  // Consejos: los de la hipótesis recomendada más los generales
  const gen = [['RETIE art. 15','Cualquier hipótesis exige sistema de puesta a tierra diseñado para tensiones de paso y contacto tolerables.'],
    ['NTT‑01 nota 10','Use cubiertas para bujes y cortacircuitos donde haya fauna silvestre.']];
  $('scheme').innerHTML = `<h2 style="font-size:1.2rem">Esquema de la hipótesis recomendada</h2>${SCHEMES[hs.indexOf(best)]}`;
  $('tips').innerHTML = [...best.tips, ...gen].map(t => `<div class="tip">${t[1]}<small>${t[0]}</small></div>`).join('');
}

/* ============ 6. MÓDULO VANO Y FLECHA (cambio de estado, viento, desnivel) ============ */
const FIELDS_VANO = [
 {id:'vL', l:'Longitud del vano', u:'m', min:50, max:600, step:5, v:300},
 {id:'vDh',l:'Desnivel Δh entre apoyos', u:'m', min:0, max:80, step:1, v:0},
 {id:'vhA',l:'Altura del apoyo más bajo (A)', u:'m', min:6, max:60, step:.5, v:12},
 {id:'vm', l:'Masa del conductor', u:'kg/m', min:.2, max:3, step:.05, v:1.2},
 {id:'vA', l:'Área (0 = usar diámetro)', u:'mm²', min:0, max:900, step:5, v:150},
 {id:'vD', l:'Diámetro (0 = usar área)', u:'mm', min:0, max:50, step:.5, v:0},
 {id:'vE', l:'Módulo de elasticidad', u:'GPa', min:30, max:200, step:1, v:70},
 {id:'vAl',l:'Coeficiente térmico', u:'×10⁻⁶ /°C', min:10, max:30, step:.5, v:23},
 {id:'vT1',l:'Temperatura inicial', u:'°C', min:-10, max:60, step:1, v:15},
 {id:'vT2',l:'Temperatura final', u:'°C', min:-10, max:90, step:1, v:50},
 {id:'vk', l:'La tensión conocida corresponde al', sel:[[1,'Estado 1 (inicial)'],[2,'Estado 2 (final)']]},
 {id:'vH', l:'Tensión horizontal conocida', u:'N', min:1000, max:80000, step:100, v:20000},
 {id:'vV', l:'Viento en el estado 2', u:'m/s', min:0, max:60, step:1, v:0},
 {id:'vR', l:'Densidad del aire', u:'kg/m³', min:1, max:1.4, step:.005, v:1.225},
 {id:'vC', l:'Coeficiente aerodinámico Cd', u:'', min:.5, max:2, step:.05, v:1},
 {id:'vX', l:'Carga de hielo (estado 2)', u:'N/m', min:0, max:30, step:.5, v:0}
];
// Ejercicios de clase: pulsar un botón carga sus datos
const PRESETS = {
 'Ej. 1 · a nivel': {vL:300,vDh:0,vm:1.2,vA:150,vD:0,vE:70,vAl:23,vT1:15,vT2:50,vk:1,vH:20000,vV:0,vR:1.225,vC:1,vX:0},
 'Ej. 2 · con viento': {vL:350,vDh:0,vm:1.5,vA:0,vD:28,vE:75,vAl:19,vT1:20,vT2:45,vk:1,vH:25000,vV:25,vR:1.225,vC:1,vX:0},
 'Ej. 3 · con desnivel': {vL:350,vDh:30,vm:1.3,vA:150,vD:0,vE:70,vAl:23,vT1:15,vT2:45,vk:2,vH:22000,vV:25,vR:1.22,vC:1,vX:0}
};

function calcVano(d){
  const L = d.vL, Dh = d.vDh;
  const A = d.vA || Math.PI*d.vD**2/4, D = (d.vD || Math.sqrt(4*A/Math.PI))/1000;  // mm² y m
  const EA = d.vE*1e9*A*1e-6, al = d.vAl*1e-6, dT = d.vT2 - d.vT1;
  const wp = d.vm*9.81, ww = 0.5*d.vR*d.vV**2*d.vC*D;       // peso y empuje del viento (N/m)
  const w1 = wp, w2 = Math.hypot(wp + d.vX, ww);            // carga resultante de cada estado
  const k = (w,H) => w*w*L*L/(24*H*H);
  // Ecuación de cambio de estado igualada a cero; es monótona en la incógnita
  const f = (H1,H2) => k(w2,H2) - k(w1,H1) - al*dT - (H2-H1)/EA;
  const solve = g => { let lo = 1, hi = 1e7; const s = g(lo) > 0;
    for (let i=0; i<200; i++){ const m = (lo+hi)/2; (g(m) > 0) === s ? lo = m : hi = m; } return (lo+hi)/2; };
  const H1 = d.vk == 1 ? d.vH : solve(h => f(h, d.vH));
  const H2 = d.vk == 1 ? solve(h => f(d.vH, h)) : d.vH;
  // Geometría de la parábola, pendientes, tensiones en los apoyos y altura mínima
  const geo = (w,H) => { const x0 = L/2 - H*Dh/(w*L), y0 = -w*x0*x0/(2*H);
    const sA = Dh/L - w*L/(2*H), sB = Dh/L + w*L/(2*H);
    return {w, H, fl: w*L*L/(8*H), x0, y0, sA, sB, TA: H*Math.sqrt(1+sA*sA), TB: H*Math.sqrt(1+sB*sB), hmin: d.vhA + y0}; };
  return {A, D, EA, dT, wp, ww, s1: geo(w1,H1), s2: geo(w2,H2)};
}

function updateVano(){
  const d = read(FIELDS_VANO), r = calcVano(d), a = r.s1, b = r.s2, fv = b.fl*(r.wp+d.vX)/b.w;
  $('vkpis').innerHTML = [[fmt(a.H,0)+' N','Tensión H₁'], [fmt(b.H,0)+' N','Tensión H₂'],
    [fmt(a.fl,3)+' m','Flecha f₁'], [fmt(b.fl,3)+' m','Flecha f₂']]
    .map(([v,s],i) => `<div class="kpi" title="${['Ecuación de cambio de estado','Ecuación de cambio de estado','f = w·L² / (8·H)','f = w·L² / (8·H)'][i]}"><b>${v}</b><span>${s}</span></div>`).join('');
  const rows = [['Carga w (N/m)','w',3],['Tensión H (N)','H',0],['Flecha f (m)','fl',3],['x₀ (m)','x0',3],['y₀ (m)','y0',3],
    ['S_A','sA',4],['S_B','sB',4],['T_A (N)','TA',1],['T_B (N)','TB',1],['h_min (m)','hmin',2]];
  $('vtab').innerHTML = `<table><tr><th></th><th>Estado 1 · ${d.vT1} °C</th><th>Estado 2 · ${d.vT2} °C</th></tr>` +
    rows.map(([n,key,x]) => `<tr><td>${n}</td><td>${fmt(a[key],x)}</td><td>${fmt(b[key],x)}</td></tr>`).join('') + '</table>';
  $('vsteps').innerHTML = `<h2 style="font-size:1.2rem">Paso a paso</h2><ol>
    <li>Peso: w = m·g = ${fmt(d.vm,2)} × 9,81 = <b>${fmt(r.wp,3)} N/m</b></li>
    ${d.vV>0 || d.vX>0 ? `<li>Viento: w_v = ½·ρ·V²·Cd·d = ½ × ${d.vR} × ${d.vV}² × ${d.vC} × ${fmt(r.D,4)} = <b>${fmt(r.ww,3)} N/m</b>. Resultante: w₂ = √((w + hielo)² + w_v²) = <b>${fmt(b.w,3)} N/m</b></li>` : ''}
    <li>Rigidez axial: EA = ${fmt(d.vE)} GPa × ${fmt(r.A,1)} mm² = <b>${fmt(r.EA,0)} N</b>; Δt = ${d.vT2} − ${d.vT1} = <b>${r.dT} °C</b></li>
    <li>Cambio de estado (incógnita H${d.vk==1?'₂':'₁'}, por método numérico): (H₂ − H₁)/EA + α·Δt = L²/24 · (w₂²/H₂² − w₁²/H₁²) → H₁ = <b>${fmt(a.H,0)} N</b>, H₂ = <b>${fmt(b.H,0)} N</b></li>
    <li>Flechas: f = w·L²/8H → f₁ = <b>${fmt(a.fl,3)} m</b>, f₂ = <b>${fmt(b.fl,3)} m</b></li>
    <li>Geometría (estado 2): x₀ = L/2 − H·Δh/(wL) = ${fmt(b.x0,3)} m; y₀ = −w·x₀²/2H = ${fmt(b.y0,3)} m; S_A,B = Δh/L ∓ wL/2H = ${fmt(b.sA,4)} y ${fmt(b.sB,4)}; T = H√(1+S²): T_A = <b>${fmt(b.TA,1)} N</b>, T_B = <b>${fmt(b.TB,1)} N</b>; h_min = h_A + y₀ = <b>${fmt(b.hmin,2)} m</b></li></ol>`;
  const wn = [];                                            // avisos de datos poco realistas
  if (a.H > 9e6 || b.H > 9e6 || a.H < 5 || b.H < 5) wn.push('La ecuación no converge a un valor físico: revise los datos.');
  if (b.fl/d.vL > 0.06) wn.push('La flecha supera el 6 % del vano: es poco habitual, revise longitud, masa o tensión.');
  if (b.hmin < 0 || a.hmin < 0) wn.push('El cable toca el suelo: aumente la altura de los apoyos o la tensión.');
  $('valert').innerHTML = wn.map(t => `<div class="alert warn t" style="border-color:var(--warn)"><span style="color:var(--ink)">${t}</span></div>`).join('');
  $('vchart').innerHTML = `<h2 style="font-size:1.2rem">Perfil del vano</h2>${profileSVG(d,r)}`;
  $('vcurve').innerHTML = `<h2 style="font-size:1.2rem">Flecha y tensión según la temperatura</h2>${curveSVG(d,r)}`;
  const tips = [
    ['RETIE, distancias de seguridad', `Con la flecha del estado 2 el cable queda a ${fmt(b.hmin,2)} m del suelo en su punto más bajo: compárelo con la distancia de seguridad exigida para el nivel de tensión.`],
    ['Conductor', `La tensión mecánica máxima es ${fmt(Math.max(a.TA,a.TB,b.TA,b.TB),0)} N: divídala entre la carga de rotura del conductor para hallar el factor de seguridad.`],
    d.vV > 0 ? ['Viento', `Con viento el cable se inclina: la flecha vertical es ≈ ${fmt(fv,3)} m y la flecha en el plano de la carga resultante, ${fmt(b.fl,3)} m.`]
             : ['NTC 2663', 'Dimensione herrajes y apoyos con la mayor tensión de todos los estados de carga.']
  ];
  $('vtips').innerHTML = tips.map(t => `<div class="tip">${t[1]}<small>${t[0]}</small></div>`).join('');
}

/* ============ 6b. GRÁFICOS, ESQUEMAS E INFORME ============ */
// Perfil del vano: apoyos, suelo y parábola del cable en los dos estados
function profileSVG(d,r){
  const L = d.vL, hA = d.vhA, top = hA + d.vDh, W = 640, Hg = 300, m = 40;
  const lo = Math.min(0, r.s1.hmin, r.s2.hmin) - 1, hi = top + 2;
  const X = x => m + x*(W-2*m)/L, Y = y => Hg - m - (y-lo)*(Hg-2*m)/(hi-lo);
  const path = s => Array.from({length:61}, (_,i) => { const x = L*i/60, y = hA + d.vDh/L*x + s.w/(2*s.H)*(x*x - L*x);
    return (i?'L':'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1); }).join('');
  const s2 = r.s2, pt = s2.x0 > 0 && s2.x0 < L
    ? `<circle class="sv-d" r="4" cx="${X(s2.x0)}" cy="${Y(s2.hmin)}"/><text class="sv-t" x="${X(s2.x0)+8}" y="${Y(s2.hmin)+16}">h_min = ${fmt(s2.hmin,2)} m</text>` : '';
  return `<svg viewBox="0 0 ${W} ${Hg}" style="width:100%;height:auto" role="img" aria-label="Perfil del vano">
    <line class="sv-g" x1="${m-10}" x2="${W-m+10}" y1="${Y(0)}" y2="${Y(0)}"/>
    <line class="sv-p" x1="${X(0)}" x2="${X(0)}" y1="${Y(0)}" y2="${Y(hA)}"/><line class="sv-p" x1="${X(L)}" x2="${X(L)}" y1="${Y(0)}" y2="${Y(top)}"/>
    <path class="sv-1" d="${path(r.s1)}"/><path class="sv-2" d="${path(s2)}"/>${pt}
    <text class="sv-t" x="${X(0)+6}" y="${Y(hA)-6}">A · ${fmt(hA,1)} m</text><text class="sv-t" x="${X(L)-70}" y="${Y(top)-6}">B · ${fmt(top,1)} m</text>
    <text class="sv-t sv-l1" x="${m}" y="16">Estado 1 · ${d.vT1} °C · f = ${fmt(r.s1.fl,2)} m</text>
    <text class="sv-t sv-l2" x="${m}" y="34">Estado 2 · ${d.vT2} °C · f = ${fmt(s2.fl,2)} m</text></svg>`;
}
// Curvas de flecha (izquierda) y tensión H (derecha) para 0–80 °C, con el estado 1 fijo
function curveSVG(d,r){
  const W = 640, Hg = 240, m = 48, T = Array.from({length:17}, (_,i) => i*5);
  const rs = T.map(t => calcVano({...d, vk:1, vH:r.s1.H, vT2:t}).s2), X = i => m + i*(W-2*m)/16;
  const ser = (k,cls) => { const v = rs.map(s => s[k]), a = Math.min(...v), b = Math.max(...v);
    return {a, b, svg: `<path class="${cls}" d="${v.map((y,i) => (i?'L':'M') + X(i).toFixed(1) + ' ' + (Hg-m-(y-a)/((b-a)||1)*(Hg-2*m)).toFixed(1)).join('')}"/>`}; };
  const f = ser('fl','sv-2'), h = ser('H','sv-1'), xc = m + Math.min(Math.max(d.vT2,0),80)/80*(W-2*m);
  return `<svg viewBox="0 0 ${W} ${Hg}" style="width:100%;height:auto" role="img" aria-label="Curvas de flecha y tensión">
    <line class="sv-g" x1="${m}" x2="${W-m}" y1="${Hg-m}" y2="${Hg-m}"/><line class="sv-g" stroke-dasharray="4 4" x1="${xc}" x2="${xc}" y1="${m-10}" y2="${Hg-m}"/>
    ${f.svg}${h.svg}
    <text class="sv-t sv-l2" x="4" y="16">Flecha f</text><text class="sv-t sv-l2" x="4" y="${m+4}">${fmt(f.b,1)} m</text><text class="sv-t sv-l2" x="4" y="${Hg-m}">${fmt(f.a,1)} m</text>
    <text class="sv-t sv-l1" text-anchor="end" x="${W-4}" y="16">Tensión H</text><text class="sv-t sv-l1" text-anchor="end" x="${W-4}" y="${m+4}">${fmt(h.b/1000,1)} kN</text><text class="sv-t sv-l1" text-anchor="end" x="${W-4}" y="${Hg-m}">${fmt(h.a/1000,1)} kN</text>
    ${[0,20,40,60,80].map(t => `<text class="sv-t" text-anchor="middle" x="${X(t/5)}" y="${Hg-m+18}">${t} °C</text>`).join('')}</svg>`;
}
// Esquemas de montaje (mismo orden que las hipótesis H1, H2, H3)
const SCHEMES = [
`<svg viewBox="0 0 300 200" role="img" aria-label="Subestación tipo poste"><line class="sv-g" x1="10" x2="290" y1="185" y2="185"/>
 <line class="sv-p" x1="150" y1="15" x2="150" y2="185"/><line class="sv-p" x1="70" y1="35" x2="230" y2="35"/><line class="sv-p" x1="90" y1="70" x2="210" y2="70"/>
 <rect class="sv-b" x="88" y="64" width="9" height="20"/><rect class="sv-b" x="146" y="64" width="9" height="20"/><rect class="sv-b" x="203" y="64" width="9" height="20"/>
 <rect class="sv-b" x="158" y="110" width="52" height="40"/><rect class="sv-b" x="214" y="112" width="8" height="24"/>
 <text class="sv-t" x="8" y="30">Red MT</text><text class="sv-t" x="8" y="62">Cortacircuitos</text><text class="sv-t" x="158" y="166">Transformador</text><text class="sv-t" x="226" y="128">DPS</text><text class="sv-t" x="156" y="198">Tierra</text></svg>`,
`<svg viewBox="0 0 300 200" role="img" aria-label="Transformador tipo pedestal"><rect class="sv-g" stroke-dasharray="5 4" x="25" y="40" width="190" height="130"/>
 <rect class="sv-b" x="60" y="105" width="120" height="14"/><rect class="sv-b" x="75" y="60" width="90" height="45"/>
 <rect class="sv-b" x="235" y="125" width="45" height="40"/><line class="sv-p" x1="180" y1="115" x2="235" y2="140"/>
 <text class="sv-t" x="82" y="86">Transformador</text><text class="sv-t" x="84" y="136">Base y foso</text><text class="sv-t" x="226" y="118">Trampa de aceite</text><text class="sv-t" x="28" y="32">Cerramiento ≥ 1,5 m</text></svg>`,
`<svg viewBox="0 0 300 200" role="img" aria-label="Subestación interior"><rect class="sv-p" x="15" y="25" width="270" height="150"/>
 <rect class="sv-b" x="25" y="45" width="65" height="120"/><rect class="sv-b" x="105" y="45" width="90" height="120"/><rect class="sv-b" x="210" y="45" width="65" height="120"/>
 <text class="sv-t" x="36" y="110">Celda MT</text><text class="sv-t" x="124" y="110">Trafo</text><text class="sv-t" x="220" y="110">Celda BT</text><text class="sv-t" x="25" y="18">Local ≥ 2,5 m · 100 lux</text></svg>`
];
// Informe imprimible: copia datos y resultados de la pestaña activa y abre imprimir / guardar PDF
const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function printReport(){
  const vano = !$('p-vano').hidden, F = vano ? FIELDS_VANO : FIELDS;
  const rows = F.map(f => { const el = $(f.id);
    const v = f.chk ? (el.checked ? 'Sí' : 'No') : f.sel ? el.options[el.selectedIndex].text : el.value + ' ' + (f.u||'');
    return `<tr><td>${f.l}</td><td>${v}</td></tr>`; }).join('');
  const who = [$('inf-n').value, $('inf-i').value, $('inf-m-on').checked ? $('inf-m').value : '', new Date().toLocaleDateString('es-CO')].filter(Boolean).map(esc).join(' · ');
  $('report').innerHTML = `<h1>${vano ? 'Informe de cálculo de vano y flecha' : 'Informe de selección de subestación'}</h1><p>${who}</p>
    <h2 style="font-size:1.2rem">Datos de entrada</h2><table>${rows}</table>${document.querySelector(vano ? '#p-vano main' : '#p-trafo main').innerHTML}`;
  window.print();
}

/* ============ 7. ARRANQUE Y PESTAÑAS ============ */
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 'p-' + b.dataset.tab);
});
$('inf-m-on').onchange = () => $('inf-m').disabled = !$('inf-m-on').checked;  // la materia es opcional
$('inf-b').onclick = printReport;
buildForm(FIELDS, 'form', update);       update();
buildForm(FIELDS_VANO, 'vform', updateVano); updateVano();
// Botones de ejercicios: escriben los datos en el formulario y recalculan
$('vpre').innerHTML = Object.keys(PRESETS).map(n => `<button type="button">${n}</button>`).join('');
document.querySelectorAll('#vpre button').forEach(b => b.onclick = () => {
  for (const [id,v] of Object.entries(PRESETS[b.textContent])){
    $(id).value = v; const r = document.querySelector(`[data-pair="${id}"]`); if (r) r.value = v; }
  updateVano();
});