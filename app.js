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
 {id:'vX', l:'Carga de hielo (estado 2)', u:'N/m', min:0, max:30, step:.5, v:0},
 {id:'vS', l:'Distancia mínima al suelo (dato RETIE, 0 = no verificar)', u:'m', min:0, max:20, step:.1, v:0}
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
  return {A, D, EA, dT, wp, ww, geo, s1: geo(w1,H1), s2: geo(w2,H2)};
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
  const hm = Math.min(a.hmin, b.hmin);
  if (d.vS > 0 && hm < d.vS) wn.push(`La altura mínima (${fmt(hm,2)} m) es menor que la distancia de seguridad de ${fmt(d.vS,1)} m.`);
  $('valert').innerHTML = (d.vS > 0 && hm >= d.vS ? `<div class="alert ok t" style="border-color:var(--ok)"><span style="color:var(--ink)">Cumple la distancia mínima al suelo de ${fmt(d.vS,1)} m (h_min = ${fmt(hm,2)} m).</span></div>` : '') + wn.map(t => `<div class="alert warn t" style="border-color:var(--warn)"><span style="color:var(--ink)">${t}</span></div>`).join('');
  $('vchart').innerHTML = `<h2 style="font-size:1.2rem">Perfil del vano</h2><p class="hov" id="vhov">Pase el cursor sobre el gráfico para ver x, Z y flecha.</p>${profileSVG(d,r)}`;
  const sv = $('vchart').querySelector('svg');                // guía interactiva (ratón o dedo)
  sv.onpointermove = e => { const q = sv.getBoundingClientRect(), px = (e.clientX-q.left)/q.width*640;
    const x = Math.min(Math.max((px-40)*d.vL/560, 0), d.vL), z = cableY(d,b,x), g = $('vgd'), gx = 40 + x*560/d.vL;
    g.setAttribute('x1', gx); g.setAttribute('x2', gx); g.style.display = '';
    $('vhov').textContent = `x = ${fmt(x,1)} m | Z₂ = ${fmt(z,2)} m | flecha = ${fmt(d.vhA + d.vDh/d.vL*x - z,2)} m`; };
  sv.onpointerleave = () => $('vgd').style.display = 'none';
  update3D(d,r);
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
    <line class="sv-g" stroke-dasharray="3 3" x1="${X(0)}" y1="${Y(hA)}" x2="${X(L)}" y2="${Y(top)}"/>
    ${d.vS > 0 ? `<line class="sv-s" x1="${m-10}" x2="${W-m+10}" y1="${Y(d.vS)}" y2="${Y(d.vS)}"/><text class="sv-t sv-l2" x="${W-m-150}" y="${Y(d.vS)-5}">Distancia mínima ${fmt(d.vS,1)} m</text>` : ''}
    <line class="sv-p" x1="${X(0)}" x2="${X(0)}" y1="${Y(0)}" y2="${Y(hA)}"/><line class="sv-p" x1="${X(L)}" x2="${X(L)}" y1="${Y(0)}" y2="${Y(top)}"/>
    <path class="sv-1" d="${path(r.s1)}"/><path class="sv-2" d="${path(s2)}"/>${pt}
    <text class="sv-t" x="${X(0)+6}" y="${Y(hA)-6}">A · ${fmt(hA,1)} m</text><text class="sv-t" x="${X(L)-70}" y="${Y(top)-6}">B · ${fmt(top,1)} m</text>
    <text class="sv-t sv-l1" x="${m}" y="16">Estado 1 · ${d.vT1} °C · f = ${fmt(r.s1.fl,2)} m</text>
    <text class="sv-t sv-l2" x="${m}" y="34">Estado 2 · ${d.vT2} °C · f = ${fmt(s2.fl,2)} m</text><line id="vgd" class="sv-g" y1="${m-10}" y2="${Hg-m}" style="display:none"/></svg>`;
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
  const tab = ['vano','linea','epm'].find(t => !$('p-'+t).hidden) || 'trafo', vano = tab !== 'trafo', F = {vano:FIELDS_VANO, linea:FIELDS_LINEA, epm:FIELDS_EPM}[tab] || FIELDS;
  const rows = F.map(f => { const el = $(f.id);
    const v = f.chk ? (el.checked ? 'Sí' : 'No') : f.sel ? el.options[el.selectedIndex].text : el.value + ' ' + (f.u||'');
    return `<tr><td>${f.l}</td><td>${v}</td></tr>`; }).join('');
  const who = [$('inf-n').value, $('inf-i').value, $('inf-m-on').checked ? $('inf-m').value : '', new Date().toLocaleDateString('es-CO')].filter(Boolean).map(esc).join(' · ');
  $('report').innerHTML = `<h1>${vano ? 'Informe de cálculo de vano y flecha' : 'Informe de selección de subestación'}</h1><p>${who}</p>
    <h2 style="font-size:1.2rem">Datos de entrada</h2><table>${rows}</table>${(c => (c.querySelector('#v3d')?.remove(), c.innerHTML))(document.querySelector('#p-' + tab + ' main').cloneNode(true))}`;
  window.print();
}

/* ============ 6c. VISTA 3D (three.js, sin dependencias extra) ============ */
// Altura del cable en x para un estado s (parábola con desnivel)
const cableY = (d,s,x) => d.vhA + d.vDh/d.vL*x + s.w/(2*s.H)*(x*x - d.vL*x);
const VIEWS = {iso:[-.7,1.1,1.1], perfil:[0,1.5708,1], frente:[1.5708,1.5708,.8], planta:[0,.02,1.1]};  // [θ, φ, factor de distancia]
let T3 = null;                                              // escena, cámara y estado de la órbita

function init3D(){
  const box = $('v3d-box');
  if (T3) return draw3D();
  if (typeof THREE === 'undefined') { box.textContent = 'No se pudo cargar three.js: revise la conexión a internet.'; return; }
  const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(window.devicePixelRatio);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1622);
  const world = new THREE.Group(); world.scale.y = 3; scene.add(world);        // exagera la vertical ×3
  T3 = {renderer, scene, world, camera: new THREE.PerspectiveCamera(40,1,1,5000), cam: {th:0, ph:1, R:300, t:new THREE.Vector3()}};
  const el = renderer.domElement; box.prepend(el); let drag = null;
  el.onpointerdown = e => { drag = [e.clientX, e.clientY]; el.setPointerCapture(e.pointerId); };
  el.onpointerup = () => drag = null;
  el.onpointermove = e => { if (!drag) return; const c = T3.cam;                  // arrastrar = girar
    c.th -= (e.clientX-drag[0])*.006; c.ph = Math.min(Math.max(c.ph - (e.clientY-drag[1])*.006, .02), Math.PI-.05);
    drag = [e.clientX, e.clientY]; draw3D(); };
  el.addEventListener('wheel', e => { e.preventDefault(); T3.cam.R *= 1 + Math.sign(e.deltaY)*.08; draw3D(); }, {passive:false});
  document.querySelectorAll('#v3d-btns button').forEach(b => b.onclick = () => setView(b.dataset.v));
  window.addEventListener('resize', () => T3 && draw3D());
  setView('iso');
}
function setView(n){
  const [th,ph,k] = VIEWS[n], sc = Math.max(read(FIELDS_VANO).vL, 80);
  Object.assign(T3.cam, {th, ph, R: sc*k}); draw3D();
}
function draw3D(){
  const {renderer, scene, camera, cam} = T3, box = $('v3d-box'), w = box.clientWidth, h = box.clientHeight;
  if (!w) return;
  renderer.setSize(w, h, false); camera.aspect = w/h; camera.updateProjectionMatrix();
  camera.position.set(cam.t.x + cam.R*Math.sin(cam.ph)*Math.sin(cam.th), cam.t.y + cam.R*Math.cos(cam.ph), cam.t.z + cam.R*Math.sin(cam.ph)*Math.cos(cam.th));
  camera.lookAt(cam.t); renderer.render(scene, camera);
}
function update3D(d,r){
  if (!T3) return;
  const L = d.vL, top = d.vhA + d.vDh, sc = Math.max(L,100), beta = [0, Math.atan2(r.ww, r.wp + d.vX)];
  if (T3.dyn) T3.world.remove(T3.dyn);
  const dyn = T3.dyn = new THREE.Group(); T3.world.add(dyn);
  const grid = new THREE.GridHelper(sc*1.3, 26, 0x3a5a6a, 0x1e3342); grid.position.set(L/2, 0, 0); dyn.add(grid);
  [[0,d.vhA],[L,top]].forEach(([x,hh]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.35,.5,hh,10), new THREE.MeshBasicMaterial({color:0x9fb3c2}));
    p.position.set(x, hh/2, 0); dyn.add(p); });
  // Punto del cable: la flecha se reparte entre vertical y lateral según el desvío del viento β
  const P = (s,i,x) => { const sg = s.w/(2*s.H)*(x*x - L*x);
    return new THREE.Vector3(x, d.vhA + d.vDh/L*x + sg*Math.cos(beta[i]), -sg*Math.sin(beta[i])); };
  [r.s1, r.s2].forEach((s,i) => { const pts = Array.from({length:61}, (_,k) => P(s,i,L*k/60));
    dyn.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color: i ? 0xff9f40 : 0x8aa0b0}))); });
  if (r.ww > 0) for (let k = 1; k < 7; k++){ const q = P(r.s2,1,L*k/7), len = sc*.05;    // flechas de viento
    dyn.add(new THREE.ArrowHelper(new THREE.Vector3(0,0,1), q.clone().add(new THREE.Vector3(0,0,-len)), len, 0xffd166)); }
  if (r.s2.x0 > 0 && r.s2.x0 < L){ const m = new THREE.Mesh(new THREE.SphereGeometry(sc*.008,12,12), new THREE.MeshBasicMaterial({color:0xff4d4d}));
    m.position.copy(P(r.s2,1,r.s2.x0)); dyn.add(m); }                                   // punto de menor altura
  T3.cam.t.set(L/2, (d.vhA + d.vDh/2)*1.5, 0);
  const b = r.s2;
  $('v3d-tel').innerHTML = [['Flecha f₂',fmt(b.fl,3)+' m'],['Tensión H₂',fmt(b.H,0)+' N'],['T_A',fmt(b.TA,0)+' N'],['T_B',fmt(b.TB,0)+' N'],
    ['h_min',fmt(b.hmin,2)+' m'],['Desvío β',fmt(beta[1]*180/Math.PI,1)+' °']].map(([k,v]) => `${k}: <b>${v}</b>`).join('<br>');
  draw3D();
}

/* ============ 6d. LÍNEA DE VARIOS VANOS (vano regulador) ============ */
// Datos del conductor: se reutilizan los campos del módulo de vano (con prefijo "l"), sin geometría del vano
const LDEF = {lm:1.2, lA:120, lD:0, lE:70, lAl:19, lT1:15, lT2:50, lH:20000, lV:20, lR:1.22, lC:1, lX:0, lS:0};
const FIELDS_LINEA = FIELDS_VANO.filter(f => !['vL','vDh','vhA','vk'].includes(f.id))
  .map(f => ({...f, id:'l'+f.id.slice(1), v: LDEF['l'+f.id.slice(1)], l: f.id==='vH' ? 'Tensión horizontal H₁ (estado 1)' : f.l}));
const toV = o => ({vk:1, vhA:0, ...Object.fromEntries(Object.entries(o).map(([k,v]) => ['v'+k.slice(1), v]))});
const POLES0 = () => [{d:300,h:25,z:0}, {d:400,h:25,z:15}, {d:0,h:25,z:5}];   // d: distancia al siguiente · h: altura · z: cota del terreno
let POLES = POLES0();
const nm = i => String.fromCharCode(65+i);

function calcLinea(d,P){
  const sp = P.slice(0,-1).map((p,i) => { const q = P[i+1], a = p.z+p.h, b = q.z+q.h;
    return {i, L: Math.max(p.d,1), dh: b-a, a, z0: p.z, z1: q.z}; });
  const Lr = Math.sqrt(sp.reduce((s,v) => s + v.L**3, 0) / sp.reduce((s,v) => s + v.L, 0));   // vano regulador
  const reg = calcVano({...d, vL:Lr, vDh:0, vk:1}), H1 = d.vH, H2 = reg.s2.H;                // H2 común a todos los vanos
  sp.forEach(s => { const g = calcVano({...d, vL:s.L, vDh:s.dh, vk:1}).geo; s.s1 = g(reg.s1.w, H1); s.s2 = g(reg.s2.w, H2);
    [s.s1, s.s2].forEach(st => { let c = 1e9, lw = 1e9;                                       // altura libre mínima sobre el terreno
      for (let k=0; k<=200; k++){ const x = s.L*k/200, e = s.a + s.dh/s.L*x + st.w/(2*st.H)*(x*x - s.L*x);
        c = Math.min(c, e - (s.z0 + (s.z1-s.z0)*k/200)); lw = Math.min(lw, e); }
      st.clear = c; st.low = lw; }); });
  return {sp, Lr, H1, H2, w1: reg.s1.w, w2: reg.s2.w, ww: reg.ww};
}

function lineaSVG(r,P){
  const W = 720, Hg = 300, m = 40, xs = [0]; r.sp.forEach(s => xs.push(xs[xs.length-1] + s.L));
  const lo = Math.min(...P.map(p => p.z), ...r.sp.map(s => s.s2.low), ...r.sp.map(s => s.s1.low)) - 2, hi = Math.max(...P.map(p => p.z+p.h)) + 4;
  const X = x => m + x*(W-2*m)/xs[xs.length-1], Y = y => Hg - m - (y-lo)*(Hg-2*m)/(hi-lo);
  const cab = (s,st) => Array.from({length:41}, (_,k) => { const x = s.L*k/40, e = s.a + s.dh/s.L*x + st.w/(2*st.H)*(x*x - s.L*x);
    return (k?'L':'M') + X(xs[s.i]+x).toFixed(1) + ' ' + Y(e).toFixed(1); }).join('');
  return `<svg viewBox="0 0 ${W} ${Hg}" style="width:100%;height:auto" role="img" aria-label="Perfil de la línea">
    <path class="sv-g" style="stroke:var(--ok);stroke-width:2" d="${P.map((p,i) => (i?'L':'M') + X(xs[i]).toFixed(1) + ' ' + Y(p.z).toFixed(1)).join('')}"/>
    ${P.map((p,i) => `<line class="sv-p" x1="${X(xs[i])}" x2="${X(xs[i])}" y1="${Y(p.z)}" y2="${Y(p.z+p.h)}"/><text class="sv-t" text-anchor="middle" x="${X(xs[i])}" y="${Y(p.z+p.h)-6}">${nm(i)}</text>`).join('')}
    ${r.sp.map(s => `<path class="sv-1" d="${cab(s,s.s1)}"/><path class="sv-2" d="${cab(s,s.s2)}"/>`).join('')}
    <text class="sv-t sv-l1" x="${m}" y="16">Estado 1 · ${'${T1}'} °C</text><text class="sv-t sv-l2" x="${m}" y="34">Estado 2 · con viento</text></svg>`;
}

function updateLinea(){
  const d = toV(read(FIELDS_LINEA)), r = calcLinea(d, POLES), n = POLES.length;
  $('lkpis').innerHTML = [[fmt(r.Lr,1)+' m','Vano regulador L_r'], [fmt(r.w1,3)+' N/m','Carga w₁'], [fmt(r.w2,3)+' N/m','Carga w₂ (con viento)'], [fmt(r.H2,0)+' N','Tensión H₂ (común)']]
    .map(([v,s]) => `<div class="kpi"><b>${v}</b><span>${s}</span></div>`).join('');
  $('lchart').innerHTML = `<h2 style="font-size:1.2rem">Perfil de la línea</h2>${lineaSVG(r, POLES).replace('${T1}', d.vT1)}`;
  const rows = [['Longitud L (m)',s=>s.L,1], ['Desnivel Δh (m)',s=>s.dh,1], ['Flecha f₁ (m)',s=>s.s1.fl,3], ['Flecha f₂ (m)',s=>s.s2.fl,3],
    ['h_min₁ sobre terreno (m)',s=>s.s1.clear,2], ['h_min₂ sobre terreno (m)',s=>s.s2.clear,2], ['T_A estado 1 (N)',s=>s.s1.TA,0],
    ['T_B estado 1 (N)',s=>s.s1.TB,0], ['T_A estado 2 (N)',s=>s.s2.TA,0], ['T_B estado 2 (N)',s=>s.s2.TB,0]];
  $('ltab').innerHTML = `<table><tr><th></th>${r.sp.map(s => `<th>${nm(s.i)}–${nm(s.i+1)}</th>`).join('')}</tr>` +
    rows.map(([t,f,x]) => `<tr><td>${t}</td>${r.sp.map(s => `<td>${fmt(f(s),x)}</td>`).join('')}</tr>`).join('') +
    `</table><p class="hov">L_r = √(ΣL³ / ΣL) = ${fmt(r.Lr,1)} m · H₁ = ${fmt(r.H1,0)} N → H₂ = ${fmt(r.H2,0)} N, igual en todos los vanos (cadenas de suspensión).</p>`;
  $('lload').innerHTML = `<h2 style="font-size:1.2rem">Carga de viento sobre cada poste</h2><table><tr><th>Poste</th><th>Vano izq. (m)</th><th>Vano der. (m)</th><th>F viento (N)</th><th>F viento (kgf)</th></tr>` +
    POLES.map((p,i) => { const a = i ? r.sp[i-1].L : 0, b = i < n-1 ? r.sp[i].L : 0, F = r.ww*(a+b)/2;
      return `<tr><td>${nm(i)}</td><td>${a ? fmt(a,0) : '—'}</td><td>${b ? fmt(b,0) : '—'}</td><td>${fmt(F,0)}</td><td>${fmt(F/9.81,0)}</td></tr>`; }).join('') + '</table>';
  const wn = [], low = r.sp.filter(s => d.vS > 0 && Math.min(s.s1.clear, s.s2.clear) < d.vS).map(s => `${nm(s.i)}–${nm(s.i+1)}`);
  if (r.sp.some(s => Math.min(s.s1.clear, s.s2.clear) < 0)) wn.push('Hay un vano donde el cable toca el terreno: aumente la altura de los postes.');
  if (low.length) wn.push(`Distancia mínima de ${d.vS} m no cumplida en: ${low.join(', ')}.`);
  if (r.H2 > 9e6 || r.H2 < 5) wn.push('La ecuación no converge a un valor físico: revise los datos.');
  $('lalert').innerHTML = (d.vS > 0 && !low.length ? `<div class="alert ok t" style="border-color:var(--ok)"><span style="color:var(--ink)">Todos los vanos cumplen la distancia mínima de ${d.vS} m.</span></div>` : '') +
    wn.map(t => `<div class="alert warn t" style="border-color:var(--warn)"><span style="color:var(--ink)">${t}</span></div>`).join('');
  $('ltips').innerHTML = [
    ['Vano regulador', 'En una línea con cadenas de suspensión, H se iguala entre vanos y el estado 2 se calcula con L_r, no vano por vano.'],
    ['Postes de anclaje', 'Si un poste es de anclaje (retención), los tramos a cada lado se calculan por separado, cada uno con su propio vano regulador.'],
    ['Poste', 'Compare la carga de viento con la carga de rotura del poste y revise la tensión mecánica máxima de cada cadena de aisladores.'],
    ['RETIE, distancias de seguridad', 'Ingrese en «Distancia mínima al suelo» el valor del RETIE para su tensión y la página verificará cada vano.']
  ].map(t => `<div class="tip">${t[1]}<small>${t[0]}</small></div>`).join('');
}

// Tabla editable de postes (se redibuja solo al agregar o quitar; al escribir solo recalcula)
function drawPosts(){
  $('lposts').innerHTML = `<h2 style="font-size:1.2rem">Postes y vanos</h2><div style="overflow-x:auto"><table><tr><th>Poste</th><th>Dist. al siguiente (m)</th><th>Altura (m)</th><th>Cota terreno (m)</th></tr>` +
    POLES.map((p,i) => `<tr><td>${nm(i)}</td>` + ['d','h','z'].map(k => `<td><input type="number" step="any" data-i="${i}" data-k="${k}" value="${p[k]}" ${k==='d' && i===POLES.length-1 ? 'disabled' : ''}></td>`).join('') + '</tr>').join('') +
    `</table></div><div class="chips" style="margin:.7rem 0 0"><button type="button" id="l-add">+ Agregar poste</button><button type="button" id="l-del">− Quitar poste</button></div>`;
  $('l-add').onclick = () => { if (POLES.length < 8){ const l = POLES[POLES.length-1]; l.d = 300; POLES.push({d:0, h:l.h, z:l.z}); drawPosts(); updateLinea(); } };
  $('l-del').onclick = () => { if (POLES.length > 2){ POLES.pop(); POLES[POLES.length-1].d = 0; drawPosts(); updateLinea(); } };
}
$('lposts').oninput = e => { const t = e.target; if (t.dataset.i === undefined) return;
  POLES[t.dataset.i][t.dataset.k] = parseFloat(t.value) || 0; t.setAttribute('value', t.value); updateLinea(); };
function resetLinea(){
  POLES = POLES0();
  for (const [id,v] of Object.entries(LDEF)){ $(id).value = v; const q = document.querySelector(`[data-pair="${id}"]`); if (q) q.value = v; }
  drawPosts(); updateLinea();
}

/* ============ 6e. DISEÑO EPM: HIPÓTESIS A/B/C, FLECHAS Y CARGAS EN POSTES ============ */
// Catálogo: [masa kg/m, diámetro mm, área mm², E GPa, α 1/°C, UTS N, límite A, límite B, límite C]
const CONDUCTORES = {
 'ACSR 2 AWG (SPARROW)':[.1359,8.01,39.22,79,19.1e-6,12700,.5,.23,.14], 'ACSR 1/0 AWG (RAVEN)':[.2165,10.11,62.38,79,19.1e-6,19500,.5,.225,.14],
 'ACSR 2/0 AWG (QUAIL)':[.2726,11.35,78.65,79,19.1e-6,23600,.5,.225,.14], 'ACSR 3/0 AWG (PIGEON)':[.3439,12.75,99.23,79,19.1e-6,29400,.5,.225,.14],
 'ACSR 4/0 AWG (PENGUIN)':[.4335,14.31,125.1,79,19.1e-6,37100,.5,.22,.135], 'ACSR 266.8 KCMIL (WAXWING)':[.4313,15.47,142.6,63,21.2e-6,30600,.5,.33,.175],
 'ACSR 336.4 KCMIL (LINNET)':[.6883,18.29,198.3,74,18.9e-6,63400,.5,.19,.12], 'AAAC 1/0 AWG (AZUSA)':[.146,9.36,53.5,60,23e-6,15900,.5,.225,.13],
 'AAAC 2/0 AWG (ANAHEIM)':[.184,10.5,67.4,60,23e-6,20000,.5,.225,.13], 'AAAC 4/0 AWG (ALLIANCE)':[.293,13.26,107.2,60,23e-6,31800,.5,.22,.125]
};
const FIELDS_EPM = [
 {id:'eCat', l:'Conductor de catálogo (rellena los datos)', sel:[['','Personalizado'], ...Object.keys(CONDUCTORES).map(k => [k,k])]},
 {id:'eM', l:'Masa', u:'kg/m', min:.05, max:3, step:.001, v:.2165},   {id:'eD', l:'Diámetro', u:'mm', min:5, max:40, step:.01, v:10.11},
 {id:'eAr',l:'Área', u:'mm²', min:20, max:600, step:.1, v:62.38},    {id:'eE', l:'Módulo de elasticidad', u:'GPa', min:30, max:200, step:.5, v:79},
 {id:'eAl',l:'Coeficiente térmico', u:'×10⁻⁶ /°C', min:10, max:30, step:.1, v:19.1}, {id:'eU', l:'Carga de rotura UTS', u:'N', min:5000, max:100000, step:100, v:19500},
 {id:'eLA',l:'Límite hipótesis A (fracción UTS)', u:'', min:.05, max:.7, step:.005, v:.5}, {id:'eLB',l:'Límite hipótesis B', u:'', min:.05, max:.7, step:.005, v:.225},
 {id:'eLC',l:'Límite hipótesis C (EDS)', u:'', min:.05, max:.7, step:.005, v:.14}, {id:'eN', l:'Conductores por estructura', u:'', min:1, max:6, step:1, v:3},
 {id:'eHm',l:'Método de viento', sel:[['epm','EPM GM-012: Q·V²'],['rho','½·ρ·V²·Cd']]}, {id:'eV', l:'Velocidad del viento', u:'m/s', min:5, max:60, step:1, v:26},
 {id:'eR', l:'Densidad del aire (método ρ)', u:'kg/m³', min:1, max:1.4, step:.005, v:1.225}, {id:'eCd',l:'Coeficiente Cd (método ρ)', u:'', min:.5, max:2, step:.05, v:1},
 {id:'eAlt',l:'Altitud', u:'msnm', min:0, max:4000, step:50, v:1500}, {id:'eTm', l:'Temperatura mínima (B)', u:'°C', min:-10, max:30, step:1, v:10},
 {id:'eTc',l:'Temperatura con viento (A)', u:'°C', min:-10, max:40, step:1, v:10}, {id:'eTe', l:'Temperatura EDS (C)', u:'°C', min:0, max:40, step:1, v:20},
 {id:'eTx',l:'Temperatura máxima del conductor', u:'°C', min:20, max:90, step:1, v:50}, {id:'eS', l:'Distancia mínima al suelo (dato RETIE)', u:'m', min:0, max:20, step:.1, v:5.6},
 {id:'eFS',l:'Factor de seguridad del poste', u:'', min:1, max:5, step:.1, v:2.5}, {id:'eAm', l:'Distancia punta–amarre', u:'m', min:0, max:1, step:.05, v:.3},
 {id:'eDp',l:'Diámetro del poste en la punta', u:'m', min:.08, max:.3, step:.01, v:.14}, {id:'eDb', l:'Diámetro del poste en la base', u:'m', min:.15, max:.6, step:.01, v:.33}
];
const EPCOLS = [['d','Vano al siguiente (m)'], ['z','Cota terreno (m)'], ['h','Longitud poste (m)'], ['r','Rotura NTC 1329 (kgf)'], ['g','Deflexión (°)']];
const EP = [{d:80,z:0,h:12,r:1050,g:0}, {d:95,z:0,h:12,r:750,g:0}, {d:90,z:0,h:12,r:750,g:10}, {d:85,z:0,h:12,r:750,g:0}, {d:0,z:0,h:12,r:1050,g:0}];

// Ecuación de cambio de estado (H desconocida del estado 2) por bisección
function cambioEstado(H1,w1,t1,w2,t2,L,EA,al){
  const k = (w,H) => w*w*L*L/(24*H*H), f = H => k(w2,H) - k(w1,H1) - al*(t2-t1) - (H-H1)/EA;
  let lo = 1, hi = 1e7; for (let i=0; i<200; i++){ const m = (lo+hi)/2; f(m) > 0 ? lo = m : hi = m; } return (lo+hi)/2;
}
function calcEPM(d,P){
  const G = 9.81, w = d.eM*G, UTS = d.eU, EA = d.eE*1e9*d.eAr*1e-6, al = d.eAl*1e-6, n = P.length;
  const PV = d.eHm === 'epm' ? (.603 - .0514*d.eAlt/1000)*d.eV**2 : .5*d.eR*d.eV**2*d.eCd, pv = PV*d.eD/1000;   // presión y carga de viento
  const pt = Math.hypot(w,pv), beta = Math.atan2(pv,w)*180/Math.PI, V = P.slice(0,-1).map(p => p.d);
  const ar = Math.sqrt(V.reduce((s,a) => s + a**3, 0) / V.reduce((s,a) => s + a, 0));                        // vano regulador
  const hip = {A:{t:d.eTc, w:pt, lim:d.eLA}, B:{t:d.eTm, w, lim:d.eLB}, C:{t:d.eTe, w, lim:d.eLC}};
  let gob = null, mej = null; const bases = {};
  for (const [kb,b] of Object.entries(hip)){                       // cada hipótesis como base: se llevan las otras por cambio de estado
    const res = {}; let ok = true;
    for (const [k,h] of Object.entries(hip)){ res[k] = k === kb ? b.lim*UTS : cambioEstado(b.lim*UTS, b.w, b.t, h.w, h.t, ar, EA, al); if (res[k]/UTS > h.lim + 1e-9) ok = false; }
    bases[kb] = {res, ok}; if (ok && (!mej || res.C > mej.C)){ gob = kb; mej = res; }
  }
  const out = {w, pv, pt, PV, beta, ar, hip, bases, gob};
  if (!gob) return out;
  const HD = cambioEstado(mej[gob], hip[gob].w, hip[gob].t, w, d.eTx, ar, EA, al), TA = mej.A;
  const alt = P.map(p => p.h - (.1*p.h + .6) - d.eAm);                                                     // altura de amarre sobre el terreno
  out.mej = mej; out.HD = HD;
  out.spans = V.map((a,i) => { const yA = P[i].z + alt[i], yB = P[i+1].z + alt[i+1]; let dm = 1e9;
    for (let j=0; j<=200; j++){ const x = a*j/200; dm = Math.min(dm, yA + (yB-yA)*x/a - w*x*(a-x)/(2*HD) - (P[i].z + (P[i+1].z-P[i].z)*x/a)); }
    const fA = pt*a*a/(8*mej.A);
    return {a, fA, fAv: fA*Math.cos(beta*Math.PI/180), fB: w*a*a/(8*mej.B), fC: w*a*a/(8*mej.C), fD: w*a*a/(8*HD), dm, ok: dm >= d.eS}; });
  out.poles = P.map((p,i) => { const aL = i ? V[i-1] : 0, aR = i < n-1 ? V[i] : 0, VV = (aL+aR)/2, hi = p.z + alt[i], term = i === 0 || i === n-1;
    let VP = VV; if (i) VP += TA/pt*(hi - P[i-1].z - alt[i-1])/aL; if (i < n-1) VP += TA/pt*(hi - P[i+1].z - alt[i+1])/aR;
    const Fv = d.eN*w*VP, Fw = d.eN*pv*VV, Fa = term ? 0 : d.eN*2*TA*Math.sin(p.g*Math.PI/360), Fl = term ? d.eN*TA : 0;
    const hl = p.h - (.1*p.h + .6), Fp = PV*hl*(d.eDp+d.eDb)/2, M = Math.hypot(Fw+Fa, Fl)*alt[i] + Fp*hl*.45, Feq = M/(hl-.2), Ct = p.r*G/d.eFS;
    return {VV, VP, Fv, Fw, Fa, Fl, Fp, Feq, Ct, ok: Feq <= Ct, Tret: M/alt[i]/Math.cos(Math.PI/4)}; });
  return out;
}

const setVal = (id,v) => { $(id).value = v; const q = document.querySelector(`[data-pair="${id}"]`); if (q) q.value = v; };
function fillCat(){                                                  // al elegir un conductor se cargan sus datos de catálogo
  const c = CONDUCTORES[$('eCat').value]; if (!c) return;
  ['eM','eD','eAr','eE','eAl','eU','eLA','eLB','eLC'].forEach((id,i) => setVal(id, id === 'eAl' ? +(c[i]*1e6).toFixed(2) : c[i])); updateEPM();
}
// Tabla editable de postes reutilizable: filas en un arreglo, botones para agregar/quitar
function makeTable(box, rows, cols, fresh, onChange){
  const draw = () => { $(box).innerHTML = `<h2 style="font-size:1.2rem">Postes y vanos</h2><div style="overflow-x:auto"><table><tr><th>Poste</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr>` +
    rows.map((r,i) => `<tr><td>P${i+1}</td>${cols.map(c => `<td><input type="number" step="any" data-i="${i}" data-k="${c[0]}" value="${r[c[0]]}" ${c[0]==='d' && i===rows.length-1 ? 'disabled' : ''}></td>`).join('')}</tr>`).join('') +
    `</table></div><div class="chips" style="margin:.7rem 0 0"><button type="button" data-a="+">+ Agregar poste</button><button type="button" data-a="-">− Quitar poste</button></div>`; };
  $(box).oninput = e => { const t = e.target; if (t.dataset.i === undefined) return; rows[t.dataset.i][t.dataset.k] = parseFloat(t.value) || 0; t.setAttribute('value', t.value); onChange(); };
  $(box).onclick = e => { const a = e.target.dataset.a; if (!a) return;
    if (a === '+' && rows.length < 10){ rows[rows.length-1].d = 85; rows.push(fresh()); } if (a === '-' && rows.length > 2){ rows.pop(); rows[rows.length-1].d = 0; }
    draw(); onChange(); };
  draw();
}

function updateEPM(){
  const d = read(FIELDS_EPM), r = calcEPM(d, EP), al = (s,t) => `<div class="alert ${s} t" style="border-color:var(--${s})"><span style="color:var(--ink)">${t}</span></div>`;
  const tbl = (head, rows) => `<table><tr>${head.map(x => `<th>${x}</th>`).join('')}</tr>${rows.map(c => `<tr>${c.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</table>`;
  const st = ok => `<span class="${ok?'ok':'bad'} t"><b>${ok ? 'OK' : 'FALLA'}</b></span>`, p = (H,L) => fmt(H/L*100,1) + ' %';
  if (!r.gob){ $('ealert').innerHTML = al('bad', 'Ninguna hipótesis cumple los límites: revise el conductor, el vano o las temperaturas.'); ['ekpis','eh','et','es','ep'].forEach(i => $(i).innerHTML = ''); return; }
  const U = d.eU, H = r.hip, M = r.mej, bad = r.spans.filter(s => !s.ok).length, ret = r.poles.filter(q => !q.ok).length;
  $('ealert').innerHTML = al(bad || ret ? 'warn' : 'ok', bad || ret ? `${bad} vano(s) no cumplen la distancia al suelo y ${ret} poste(s) requieren retenida.` : 'Todos los vanos cumplen la distancia al suelo y todos los postes resisten.');
  $('ekpis').innerHTML = [[fmt(r.ar,1)+' m','Vano regulador'], [fmt(r.pt,3)+' N/m','Carga resultante · β = '+fmt(r.beta,1)+'°'], ['Hipótesis '+r.gob,'Gobernante'], [fmt(r.HD,0)+' N','Tensión a '+d.eTx+' °C']]
    .map(([v,s]) => `<div class="kpi"><b>${v}</b><span>${s}</span></div>`).join('');
  $('eh').innerHTML = `<h2 style="font-size:1.2rem">Hipótesis de tensión (base → resultado en A, B y C)</h2>` + tbl(['Base','% UTS en A','% UTS en B','% UTS en C','Resultado'],
    Object.entries(r.bases).map(([k,b]) => [`${k===r.gob?'<b>':''}${k} (${fmt(H[k].lim*100,1)} %)${k===r.gob?' · gobernante</b>':''}`, p(b.res.A,U), p(b.res.B,U), p(b.res.C,U), st(b.ok)])) +
    `<p class="hov">La gobernante es la que cumple los tres límites y deja la mayor tensión en EDS (C).</p>`;
  $('et').innerHTML = `<h2 style="font-size:1.2rem">Tensiones en el vano regulador</h2>` + tbl(['Hipótesis','t (°C)','w (N/m)','H (N)','% UTS','Límite','Estado'],
    [...Object.entries(H).map(([k,h]) => [k, h.t, fmt(h.w,3), fmt(M[k],0), p(M[k],U), p(h.lim,1), st(M[k]/U <= h.lim + 1e-9 && M[k]/U <= .6)]), ['Flecha máx.', d.eTx, fmt(r.w,3), fmt(r.HD,0), p(r.HD,U), '—', '—']]);
  $('es').innerHTML = `<h2 style="font-size:1.2rem">Flechas y distancia al suelo</h2><div style="overflow-x:auto">` + tbl(['Vano','a (m)','f_A (m)','f_A vert. (m)','f_B (m)','f_C (m)','f_máx (m)','Dist. suelo (m)','Estado'],
    r.spans.map((s,i) => [`P${i+1}–P${i+2}`, fmt(s.a,1), fmt(s.fA,3), fmt(s.fAv,3), fmt(s.fB,3), fmt(s.fC,3), fmt(s.fD,3), fmt(s.dm,2), st(s.ok)])) + '</div>';
  $('ep').innerHTML = `<h2 style="font-size:1.2rem">Cargas en los postes (hipótesis A)</h2><div style="overflow-x:auto">` + tbl(['Poste','VV (m)','VP (m)','Vertical (N)','Viento (N)','Ángulo (N)','Long. (N)','Viento poste (N)','F eq. punta (N)','C. trabajo (N)','Estado'],
    r.poles.map((q,i) => [`P${i+1}`, fmt(q.VV,1), fmt(q.VP,1), fmt(q.Fv,0), fmt(q.Fw,0), fmt(q.Fa,0), fmt(q.Fl,0), fmt(q.Fp,0), fmt(q.Feq,0), fmt(q.Ct,0), q.ok ? st(true) : `<span class="bad t"><b>RETENIDA</b> ≈ ${fmt(q.Tret,0)} N</span>`])) +
    `</div><p class="hov">Retenida a 45°: cable con carga de rotura de al menos el doble de la tensión indicada.</p>`;
  $('etips').innerHTML = [['Hipótesis '+r.gob, `Define la tensión de diseño: H = ${fmt(M.A,0)} N en A, ${fmt(M.B,0)} N en B y ${fmt(M.C,0)} N en EDS.`],
    ['Viento', d.eHm === 'epm' ? 'Se usa Q·V² con Q = 0,603 − 0,0514·(altitud/1000), como la guía EPM GM-012. Cambie el método si el ejercicio da ρ y Cd.' : 'Se usa ½·ρ·V²·Cd con los datos del ejercicio.'],
    ['Postes', ret ? 'Los postes marcados exceden su carga de trabajo: suba la rotura del poste, acorte vanos o instale retenida.' : 'Los postes resisten con el factor de seguridad elegido; revise también las cimentaciones.']]
    .map(t => `<div class="tip">${t[1]}<small>${t[0]}</small></div>`).join('');
}

/* ============ 7. ARRANQUE Y PESTAÑAS ============ */
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 'p-' + b.dataset.tab);
  if (b.dataset.tab === 'vano') { init3D(); updateVano(); }
});
$('inf-m-on').onchange = () => $('inf-m').disabled = !$('inf-m-on').checked;  // la materia es opcional
$('inf-b').onclick = printReport;
buildForm(FIELDS, 'form', update);       update();
buildForm(FIELDS_VANO, 'vform', updateVano); updateVano();
$('lpre').innerHTML = '<button type="button">Ejercicio de la pizarra (3 postes)</button>'; $('lpre').firstChild.onclick = resetLinea;
drawPosts(); buildForm(FIELDS_LINEA, 'lform', updateLinea); updateLinea();
buildForm(FIELDS_EPM, 'eform', updateEPM);
makeTable('eposts', EP, EPCOLS, () => ({d:0, z:0, h:12, r:750, g:0}), updateEPM);
$('eform').addEventListener('change', e => { if (e.target.id === 'eCat') fillCat(); });
$('eCat').value = 'ACSR 1/0 AWG (RAVEN)'; fillCat();
// Botones de ejercicios: escriben los datos en el formulario y recalculan
$('vpre').innerHTML = Object.keys(PRESETS).map(n => `<button type="button">${n}</button>`).join('');
document.querySelectorAll('#vpre button').forEach(b => b.onclick = () => {
  for (const [id,v] of Object.entries(PRESETS[b.textContent])){
    $(id).value = v; const r = document.querySelector(`[data-pair="${id}"]`); if (r) r.value = v; }
  updateVano();
});
