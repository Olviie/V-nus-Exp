import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, ShoppingCart, BarChart3, PlusCircle, Search, Check,
  AlertTriangle, X, Loader2, Trash2, ChevronDown, ChevronUp, Store, RefreshCw, Calendar
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */
const theme = {
  bg: '#F6F3EC',
  surface: '#FFFFFF',
  ink: '#22271F',
  inkSoft: '#6E6A5E',
  border: '#E4DFD2',
  primary: '#1E3A34',
  primarySoft: '#2E4F47',
  accent: '#B8863B',
  accentSoft: '#F1E4C8',
  success: '#3F7A5D',
  successSoft: '#E4EFE8',
  danger: '#B0483A',
  dangerSoft: '#F5E4E1',
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
.venusex-root { font-family: 'Inter', system-ui, sans-serif; }
.venusex-display { font-family: 'Fraunces', Georgia, serif; }
.venusex-nums { font-variant-numeric: tabular-nums; }
.venusex-eyebrow { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 600; }
input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.6; }
`;

const STORAGE_KEYS = { clientes: 'venusex_clientes_v1', vendas: 'venusex_vendas_v1' };
const PAGAMENTOS = ['Dinheiro', 'Débito', 'Crédito', 'Pix', 'Boleto', 'Transferência'];

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
function formatBRL(v) {
  const n = Number(v) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDateBR(iso) {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function normalize(s) {
  return (s || '').toString().trim().toLowerCase();
}
function nextCode(clientes) {
  let max = 0;
  clientes.forEach((c) => {
    const n = parseInt(c.codigo, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return String(max + 1).padStart(4, '0');
}
function monthLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}
function addMonthsISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const targetIndex = m - 1 + n;
  const targetYear = y + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(d, daysInTargetMonth);
  const dt = new Date(targetYear, targetMonth, day);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function diffDays(fromIso, toIso) {
  const a = new Date(fromIso + 'T00:00:00');
  const b = new Date(toIso + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
function buildAgendamentos(vendas) {
  const hoje = todayISO();
  const items = [];
  vendas.forEach((v) => {
    if (!v.parcelamento || !v.diaPagamento || !v.qtdParcelas) return;
    const pagas = Array.isArray(v.parcelasPagas) ? v.parcelasPagas : [];
    for (let i = 0; i < v.qtdParcelas; i++) {
      const data = addMonthsISO(v.diaPagamento, i);
      const paga = !!pagas[i];
      let status = 'futura';
      if (paga) status = 'paga';
      else if (data < hoje) status = 'vencida';
      else if (diffDays(hoje, data) <= 7) status = 'proxima';
      items.push({
        vendaId: v.id,
        nomeFantasia: v.nomeFantasia,
        parcelaIndex: i,
        parcelaLabel: `${i + 1}/${v.qtdParcelas}`,
        valor: v.valorParcela,
        data,
        status,
      });
    }
  });
  return items;
}
function uid() {
  return 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* Persistência compartilhada via /api/storage (Vercel KV) */
async function storageSetWithRetry(key, value, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) return true;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) await sleep(400 * (i + 1));
  }
  throw lastErr;
}
async function fetchList(key) {
  try {
    const r = await fetch(`/api/storage?key=${encodeURIComponent(key)}`);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data.value) ? data.value : [];
  } catch (e) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Small shared UI pieces                                               */
/* ------------------------------------------------------------------ */
function Field({ label, children, hint }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium mb-1.5" style={{ color: theme.ink }}>{label}</span>
      {children}
      {hint && <span className="block text-xs mt-1" style={{ color: theme.inkSoft }}>{hint}</span>}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:ring-2 ${props.className || ''}`}
      style={{ borderColor: theme.border, backgroundColor: '#FFFFFF', color: theme.ink, ...(props.style || {}) }}
      onFocus={(e) => { e.target.style.borderColor = theme.primary; if (props.onFocus) props.onFocus(e); }}
      onBlur={(e) => { e.target.style.borderColor = theme.border; if (props.onBlur) props.onBlur(e); }}
    />
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const isError = toast.type === 'error';
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-[fadeIn_0.2s_ease-out]"
      style={{
        bottom: '84px',
        backgroundColor: isError ? theme.danger : theme.primary,
        color: '#FFFFFF',
        maxWidth: '90vw',
      }}
    >
      {isError ? <AlertTriangle size={16} /> : <Check size={16} />}
      <span>{toast.message}</span>
    </div>
  );
}

function ConfirmDeleteButton({ onConfirm, label }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  if (armed) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); setArmed(false); onConfirm(); }}
          className="px-2 py-1 rounded-lg text-xs font-medium"
          style={{ backgroundColor: theme.dangerSoft, color: theme.danger }}
        >
          Confirmar
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setArmed(false); }}
          className="p-1.5 rounded-lg hover:bg-black/5"
        >
          <X size={14} style={{ color: theme.inkSoft }} />
        </button>
      </div>
    );
  }
  return (
    <button onClick={(e) => { e.stopPropagation(); setArmed(true); }} className="p-1.5 rounded-lg hover:bg-black/5" title={label || 'Excluir'}>
      <Trash2 size={15} style={{ color: theme.inkSoft }} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Nova Venda tab                                                       */
/* ------------------------------------------------------------------ */
function NovaVendaTab({ clientes, onSalvar, saving }) {
  const blankNew = { cnpj: '', cpf: '', representante: '', email: '', telefone: '', telefone2: '', localizacao: '', obs: '' };

  const [nomeFantasia, setNomeFantasia] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [matched, setMatched] = useState(null); // client object or null
  const [touched, setTouched] = useState(false);
  const [novo, setNovo] = useState(blankNew);

  const [valorVenda, setValorVenda] = useState('');
  const [dataVenda, setDataVenda] = useState(todayISO());
  const [modalidade, setModalidade] = useState('');
  const [parcelado, setParcelado] = useState(false);
  const [qtdParcelas, setQtdParcelas] = useState('2');
  const [diaPagamento, setDiaPagamento] = useState('');
  const [obsVenda, setObsVenda] = useState('');

  const isNovoCliente = touched && nomeFantasia.trim() !== '' && !matched;
  const valorParcela = parcelado && Number(valorVenda) > 0 && Number(qtdParcelas) > 0
    ? Number(valorVenda) / Number(qtdParcelas)
    : null;

  function handleNomeChange(v) {
    setNomeFantasia(v);
    setMatched(null);
    setTouched(v.trim() !== '');
    if (v.trim() === '') { setSuggestions([]); return; }
    const nv = normalize(v);
    setSuggestions(clientes.filter((c) => normalize(c.nomeFantasia).includes(nv)).slice(0, 5));
  }

  function pickSuggestion(c) {
    setNomeFantasia(c.nomeFantasia);
    setMatched(c);
    setSuggestions([]);
    setTouched(true);
  }

  function handleNomeBlur() {
    if (!nomeFantasia.trim()) return;
    const exact = clientes.find((c) => normalize(c.nomeFantasia) === normalize(nomeFantasia));
    if (exact) setMatched(exact);
    setSuggestions([]);
  }

  function reset() {
    setNomeFantasia(''); setMatched(null); setTouched(false); setNovo(blankNew);
    setValorVenda(''); setDataVenda(todayISO()); setModalidade(''); setParcelado(false);
    setQtdParcelas('2'); setDiaPagamento(''); setObsVenda('');
  }

  function handleSubmit() {
    if (!nomeFantasia.trim() || !Number(valorVenda) || !modalidade) return;
    const venda = {
      id: uid(),
      codigoCliente: matched ? matched.codigo : null, // resolved by parent if new
      nomeFantasia: nomeFantasia.trim(),
      dataVenda,
      valorVenda: Number(valorVenda),
      modalidadePagamento: modalidade,
      parcelamento: parcelado,
      qtdParcelas: parcelado ? Number(qtdParcelas) : null,
      valorParcela: parcelado ? Number((valorParcela || 0).toFixed(2)) : null,
      diaPagamento: parcelado ? (diaPagamento || null) : null,
      parcelasPagas: parcelado ? Array(Number(qtdParcelas)).fill(false) : null,
      obs: obsVenda.trim(),
    };
    const novoCliente = matched ? null : {
      nomeFantasia: nomeFantasia.trim(),
      cnpj: novo.cnpj.trim(), cpf: novo.cpf.trim(), representante: novo.representante.trim(),
      email: novo.email.trim(), telefone: novo.telefone.trim(), telefone2: novo.telefone2.trim(),
      localizacao: novo.localizacao.trim(), dataCadastro: todayISO(), obs: novo.obs.trim(),
    };
    onSalvar(venda, novoCliente, reset);
  }

  const canSubmit = nomeFantasia.trim() !== '' && Number(valorVenda) > 0 && modalidade !== ''
    && (!parcelado || Number(qtdParcelas) > 0);

  return (
    <div className="pb-4">
      {/* Status card — the signature element: mirrors the client-lookup check from the spreadsheet */}
      <div className="mb-5">
        <div className="venusex-eyebrow mb-2" style={{ color: theme.accent }}>Cliente</div>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-xl border px-3.5 py-2.5" style={{ borderColor: theme.border, backgroundColor: '#FFFFFF' }}>
            <Search size={17} style={{ color: theme.inkSoft }} />
            <input
              value={nomeFantasia}
              onChange={(e) => handleNomeChange(e.target.value)}
              onBlur={handleNomeBlur}
              placeholder="Nome fantasia do cliente"
              className="w-full outline-none text-[15px] bg-transparent"
              style={{ color: theme.ink }}
            />
          </div>
          {suggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 rounded-xl border shadow-md overflow-hidden" style={{ borderColor: theme.border, backgroundColor: '#FFFFFF' }}>
              {suggestions.map((c) => (
                <button
                  key={c.codigo}
                  onClick={() => pickSuggestion(c)}
                  className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-black/5 flex items-center justify-between"
                >
                  <span style={{ color: theme.ink }}>{c.nomeFantasia}</span>
                  <span className="venusex-nums text-xs" style={{ color: theme.inkSoft }}>#{c.codigo}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {touched && (
          <div
            className="mt-2.5 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm"
            style={{
              backgroundColor: matched ? theme.successSoft : theme.accentSoft,
              color: matched ? theme.success : '#8A661F',
            }}
          >
            {matched ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <span>
              {matched
                ? <>Cliente cadastrado <span className="venusex-nums font-medium">#{matched.codigo}</span> — dados preenchidos automaticamente.</>
                : 'Cliente não cadastrado — preencha os dados abaixo para cadastrá-lo junto com a venda.'}
            </span>
          </div>
        )}
      </div>

      {/* Existing client preview (read-only) */}
      {matched && (
        <div className="mb-5 rounded-xl border px-4 py-3 text-sm grid grid-cols-2 gap-x-4 gap-y-1.5" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.inkSoft }}>
          <div><span className="font-medium" style={{ color: theme.ink }}>Representante:</span> {matched.representante || '—'}</div>
          <div><span className="font-medium" style={{ color: theme.ink }}>Telefone:</span> {matched.telefone || '—'}</div>
          <div className="col-span-2"><span className="font-medium" style={{ color: theme.ink }}>Localização:</span> {matched.localizacao || '—'}</div>
        </div>
      )}

      {/* New client fields */}
      {isNovoCliente && (
        <div className="mb-6 rounded-2xl border-2 border-dashed p-4" style={{ borderColor: theme.accent, backgroundColor: '#FFFEFB' }}>
          <div className="venusex-eyebrow mb-3" style={{ color: theme.accent }}>Cadastro do novo cliente</div>
          <Field label="Nome Fantasia" hint="Confira ou corrija antes de gravar.">
            <TextInput value={nomeFantasia} onChange={(e) => handleNomeChange(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="CNPJ"><TextInput inputMode="numeric" value={novo.cnpj} onChange={(e) => setNovo({ ...novo, cnpj: e.target.value })} /></Field>
            <Field label="CPF"><TextInput inputMode="numeric" value={novo.cpf} onChange={(e) => setNovo({ ...novo, cpf: e.target.value })} /></Field>
          </div>
          <Field label="Nome do representante"><TextInput value={novo.representante} onChange={(e) => setNovo({ ...novo, representante: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Telefone"><TextInput inputMode="tel" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} /></Field>
            <Field label="2° Telefone"><TextInput inputMode="tel" value={novo.telefone2} onChange={(e) => setNovo({ ...novo, telefone2: e.target.value })} /></Field>
          </div>
          <Field label="E-mail"><TextInput type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></Field>
          <Field label="Localização"><TextInput value={novo.localizacao} onChange={(e) => setNovo({ ...novo, localizacao: e.target.value })} /></Field>
          <Field label="Observações"><TextInput value={novo.obs} onChange={(e) => setNovo({ ...novo, obs: e.target.value })} /></Field>
        </div>
      )}

      {/* Sale details */}
      <div className="venusex-eyebrow mb-2" style={{ color: theme.accent }}>Venda</div>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Valor (R$)">
          <TextInput inputMode="decimal" placeholder="0,00" value={valorVenda} onChange={(e) => setValorVenda(e.target.value.replace(',', '.'))} />
        </Field>
        <Field label="Data da venda">
          <TextInput type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} />
        </Field>
      </div>

      <Field label="Modalidade de pagamento">
        <div className="flex flex-wrap gap-2">
          {PAGAMENTOS.map((p) => (
            <button
              key={p}
              onClick={() => setModalidade(p)}
              className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
              style={modalidade === p
                ? { backgroundColor: theme.primary, color: '#FFF', borderColor: theme.primary }
                : { backgroundColor: '#FFF', color: theme.ink, borderColor: theme.border }}
            >
              {p}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Parcelamento">
        <div className="flex gap-2">
          {[{ v: false, l: 'Não' }, { v: true, l: 'Sim' }].map((opt) => (
            <button
              key={opt.l}
              onClick={() => setParcelado(opt.v)}
              className="flex-1 py-2 rounded-xl text-sm font-medium border transition-colors"
              style={parcelado === opt.v
                ? { backgroundColor: theme.primary, color: '#FFF', borderColor: theme.primary }
                : { backgroundColor: '#FFF', color: theme.ink, borderColor: theme.border }}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </Field>

      {parcelado && (
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Qtd. de parcelas">
            <TextInput type="number" min="2" inputMode="numeric" value={qtdParcelas} onChange={(e) => setQtdParcelas(e.target.value)} />
          </Field>
          <Field label="Dia do pagamento">
            <TextInput type="date" value={diaPagamento} onChange={(e) => setDiaPagamento(e.target.value)} />
          </Field>
        </div>
      )}
      {parcelado && valorParcela !== null && (
        <div className="-mt-2 mb-4 text-sm" style={{ color: theme.inkSoft }}>
          Valor por parcela: <span className="venusex-nums font-semibold" style={{ color: theme.ink }}>{formatBRL(valorParcela)}</span>
        </div>
      )}

      <Field label="Observações"><TextInput value={obsVenda} onChange={(e) => setObsVenda(e.target.value)} /></Field>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || saving}
        className="w-full mt-2 py-3.5 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-opacity"
        style={{ backgroundColor: canSubmit ? theme.accent : theme.border, color: canSubmit ? '#FFFFFF' : theme.inkSoft, opacity: saving ? 0.7 : 1 }}
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <PlusCircle size={18} />}
        Gravar informações
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Clientes tab                                                         */
/* ------------------------------------------------------------------ */
function ClientesTab({ clientes, onDelete }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const filtered = useMemo(() => {
    const nq = normalize(q);
    return clientes
      .filter((c) => !nq || normalize(c.nomeFantasia).includes(nq) || normalize(c.representante).includes(nq) || c.codigo.includes(nq))
      .sort((a, b) => a.nomeFantasia.localeCompare(b.nomeFantasia, 'pt-BR'));
  }, [clientes, q]);

  return (
    <div className="pb-4">
      <div className="flex items-center gap-2 rounded-xl border px-3.5 py-2.5 mb-4" style={{ borderColor: theme.border, backgroundColor: '#FFFFFF' }}>
        <Search size={17} style={{ color: theme.inkSoft }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente ou código"
          className="w-full outline-none text-[15px] bg-transparent" style={{ color: theme.ink }} />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10 text-sm" style={{ color: theme.inkSoft }}>
          {clientes.length === 0 ? 'Nenhum cliente cadastrado ainda. Registre a primeira venda para começar.' : 'Nenhum cliente encontrado.'}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((c) => (
          <div key={c.codigo} className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: '#FFFFFF' }}>
            <div className="w-full flex items-center justify-between px-4 py-3 gap-2">
              <button onClick={() => setOpen(open === c.codigo ? null : c.codigo)} className="flex-1 text-left flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="font-medium truncate" style={{ color: theme.ink }}>{c.nomeFantasia}</div>
                  <div className="text-xs venusex-nums" style={{ color: theme.inkSoft }}>#{c.codigo} · {c.representante || 'sem representante'}</div>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <ConfirmDeleteButton onConfirm={() => onDelete(c.codigo)} label="Excluir cliente" />
                <button onClick={() => setOpen(open === c.codigo ? null : c.codigo)} className="p-1">
                  {open === c.codigo ? <ChevronUp size={18} style={{ color: theme.inkSoft }} /> : <ChevronDown size={18} style={{ color: theme.inkSoft }} />}
                </button>
              </div>
            </div>
            {open === c.codigo && (
              <div className="px-4 pb-4 text-sm grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3" style={{ borderColor: theme.border, color: theme.inkSoft }}>
                <div><span className="font-medium" style={{ color: theme.ink }}>CNPJ:</span> {c.cnpj || '—'}</div>
                <div><span className="font-medium" style={{ color: theme.ink }}>CPF:</span> {c.cpf || '—'}</div>
                <div><span className="font-medium" style={{ color: theme.ink }}>Telefone:</span> {c.telefone || '—'}</div>
                <div><span className="font-medium" style={{ color: theme.ink }}>2° Telefone:</span> {c.telefone2 || '—'}</div>
                <div className="col-span-2"><span className="font-medium" style={{ color: theme.ink }}>E-mail:</span> {c.email || '—'}</div>
                <div className="col-span-2"><span className="font-medium" style={{ color: theme.ink }}>Localização:</span> {c.localizacao || '—'}</div>
                <div className="col-span-2"><span className="font-medium" style={{ color: theme.ink }}>Cadastrado em:</span> {formatDateBR(c.dataCadastro)}</div>
                {c.obs && <div className="col-span-2"><span className="font-medium" style={{ color: theme.ink }}>Obs:</span> {c.obs}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vendas tab                                                           */
/* ------------------------------------------------------------------ */
function VendasTab({ vendas, onDelete }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const nq = normalize(q);
    return vendas
      .filter((v) => !nq || normalize(v.nomeFantasia).includes(nq))
      .sort((a, b) => (a.dataVenda < b.dataVenda ? 1 : -1));
  }, [vendas, q]);

  return (
    <div className="pb-4">
      <div className="flex items-center gap-2 rounded-xl border px-3.5 py-2.5 mb-4" style={{ borderColor: theme.border, backgroundColor: '#FFFFFF' }}>
        <Search size={17} style={{ color: theme.inkSoft }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cliente"
          className="w-full outline-none text-[15px] bg-transparent" style={{ color: theme.ink }} />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10 text-sm" style={{ color: theme.inkSoft }}>
          {vendas.length === 0 ? 'Nenhuma venda registrada ainda.' : 'Nenhuma venda encontrada.'}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((v) => (
          <div key={v.id} className="rounded-xl border px-4 py-3 flex items-center justify-between" style={{ borderColor: theme.border, backgroundColor: '#FFFFFF' }}>
            <div>
              <div className="font-medium" style={{ color: theme.ink }}>{v.nomeFantasia}</div>
              <div className="text-xs" style={{ color: theme.inkSoft }}>
                {formatDateBR(v.dataVenda)} · {v.modalidadePagamento}
                {v.parcelamento && ` · ${v.qtdParcelas}x`}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="venusex-nums font-semibold" style={{ color: theme.primary }}>{formatBRL(v.valorVenda)}</div>
              <ConfirmDeleteButton onConfirm={() => onDelete(v.id)} label="Excluir venda" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Agendamentos tab                                                     */
/* ------------------------------------------------------------------ */
function AgendamentosTab({ vendas, onTogglePagamento }) {
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);

  const items = useMemo(() => buildAgendamentos(vendas), [vendas]);

  const filtered = useMemo(() => {
    const nq = normalize(q);
    return items
      .filter((it) => showAll || it.status !== 'paga')
      .filter((it) => !nq || normalize(it.nomeFantasia).includes(nq))
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  }, [items, q, showAll]);

  const totals = useMemo(() => {
    let vencido = 0;
    let proximos7 = 0;
    items.forEach((it) => {
      if (it.status === 'vencida') vencido += it.valor;
      if (it.status === 'proxima') proximos7 += it.valor;
    });
    return { vencido, proximos7 };
  }, [items]);

  const statusStyle = {
    vencida: { backgroundColor: theme.dangerSoft, color: theme.danger, label: 'Vencida' },
    proxima: { backgroundColor: theme.accentSoft, color: '#8A661F', label: 'Próxima' },
    futura: { backgroundColor: theme.bg, color: theme.inkSoft, label: 'Agendada' },
    paga: { backgroundColor: theme.successSoft, color: theme.success, label: 'Paga' },
  };

  return (
    <div className="pb-4">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl p-4" style={{ backgroundColor: theme.danger, color: '#FFFFFF' }}>
          <div className="venusex-eyebrow opacity-80 mb-1">Vencido</div>
          <div className="venusex-display venusex-nums text-xl font-semibold">{formatBRL(totals.vencido)}</div>
        </div>
        <div className="rounded-2xl p-4 border" style={{ borderColor: theme.border, backgroundColor: '#FFFFFF' }}>
          <div className="venusex-eyebrow mb-1" style={{ color: theme.accent }}>Próx. 7 dias</div>
          <div className="venusex-display venusex-nums text-xl font-semibold" style={{ color: theme.ink }}>{formatBRL(totals.proximos7)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border px-3.5 py-2.5 mb-3" style={{ borderColor: theme.border, backgroundColor: '#FFFFFF' }}>
        <Search size={17} style={{ color: theme.inkSoft }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cliente"
          className="w-full outline-none text-[15px] bg-transparent" style={{ color: theme.ink }} />
      </div>

      <div className="flex gap-2 mb-4">
        {[{ v: false, l: 'Pendentes' }, { v: true, l: 'Todas' }].map((opt) => (
          <button
            key={opt.l}
            onClick={() => setShowAll(opt.v)}
            className="flex-1 py-2 rounded-xl text-sm font-medium border transition-colors"
            style={showAll === opt.v
              ? { backgroundColor: theme.primary, color: '#FFF', borderColor: theme.primary }
              : { backgroundColor: '#FFF', color: theme.ink, borderColor: theme.border }}
          >
            {opt.l}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10 text-sm" style={{ color: theme.inkSoft }}>
          {items.length === 0 ? 'Nenhuma cobrança agendada. Vendas parceladas aparecem aqui automaticamente.' : 'Nenhuma cobrança encontrada.'}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((it) => {
          const s = statusStyle[it.status];
          return (
            <div key={`${it.vendaId}_${it.parcelaIndex}`} className="rounded-xl border px-4 py-3 flex items-center justify-between gap-2" style={{ borderColor: theme.border, backgroundColor: '#FFFFFF' }}>
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => onTogglePagamento(it.vendaId, it.parcelaIndex)}
                  className="shrink-0 w-6 h-6 rounded-full border flex items-center justify-center"
                  style={it.status === 'paga'
                    ? { backgroundColor: theme.success, borderColor: theme.success }
                    : { backgroundColor: '#FFF', borderColor: theme.border }}
                  title={it.status === 'paga' ? 'Marcar como pendente' : 'Marcar como paga'}
                >
                  {it.status === 'paga' && <Check size={14} color="#FFF" />}
                </button>
                <div className="min-w-0">
                  <div className="font-medium truncate" style={{ color: theme.ink }}>{it.nomeFantasia}</div>
                  <div className="text-xs venusex-nums" style={{ color: theme.inkSoft }}>
                    Parcela {it.parcelaLabel} · {formatDateBR(it.data)}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="venusex-nums font-semibold" style={{ color: theme.primary }}>{formatBRL(it.valor)}</div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: s.backgroundColor, color: s.color }}>{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resumo tab                                                           */
/* ------------------------------------------------------------------ */
function ResumoTab({ vendas }) {
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');

  const filtered = useMemo(() => {
    return vendas.filter((v) => {
      if (dataInicial && v.dataVenda < dataInicial) return false;
      if (dataFinal && v.dataVenda > dataFinal) return false;
      return true;
    });
  }, [vendas, dataInicial, dataFinal]);

  const total = filtered.reduce((s, v) => s + v.valorVenda, 0);
  const ticketMedio = filtered.length ? total / filtered.length : 0;

  const chartData = useMemo(() => {
    const map = {};
    filtered.forEach((v) => {
      const key = v.dataVenda.slice(0, 7);
      map[key] = (map[key] || 0) + v.valorVenda;
    });
    return Object.keys(map).sort().map((key) => ({
      mes: monthLabel(key + '-01'),
      total: Number(map[key].toFixed(2)),
    }));
  }, [filtered]);

  return (
    <div className="pb-4">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="Data inicial"><TextInput type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} /></Field>
        <Field label="Data final"><TextInput type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} /></Field>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-2xl p-4" style={{ backgroundColor: theme.primary, color: '#FFFFFF' }}>
          <div className="venusex-eyebrow opacity-70 mb-1">Valor arrecadado</div>
          <div className="venusex-display venusex-nums text-2xl font-semibold">{formatBRL(total)}</div>
        </div>
        <div className="rounded-2xl p-4 border" style={{ borderColor: theme.border, backgroundColor: '#FFFFFF' }}>
          <div className="venusex-eyebrow mb-1" style={{ color: theme.accent }}>Ticket médio</div>
          <div className="venusex-display venusex-nums text-2xl font-semibold" style={{ color: theme.ink }}>{formatBRL(ticketMedio)}</div>
        </div>
      </div>

      <div className="rounded-2xl border p-4 mb-4" style={{ borderColor: theme.border, backgroundColor: '#FFFFFF' }}>
        <div className="venusex-eyebrow mb-3" style={{ color: theme.accent }}>Vendas por mês</div>
        {chartData.length === 0 ? (
          <div className="text-sm text-center py-8" style={{ color: theme.inkSoft }}>Sem dados no período selecionado.</div>
        ) : (
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: theme.inkSoft }} axisLine={{ stroke: theme.border }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: theme.inkSoft }} axisLine={false} tickLine={false} width={40}
                  tickFormatter={(v) => `${(v / 1).toLocaleString('pt-BR')}`} />
                <Tooltip formatter={(v) => formatBRL(v)} contentStyle={{ borderRadius: 12, borderColor: theme.border, fontSize: 13 }} />
                <Bar dataKey="total" fill={theme.accent} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="text-sm text-center" style={{ color: theme.inkSoft }}>
        {filtered.length} venda{filtered.length === 1 ? '' : 's'} no período
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App shell                                                            */
/* ------------------------------------------------------------------ */
const TABS = [
  { key: 'venda', label: 'Nova venda', icon: PlusCircle },
  { key: 'clientes', label: 'Clientes', icon: Users },
  { key: 'vendas', label: 'Vendas', icon: ShoppingCart },
  { key: 'agendamentos', label: 'Agendamentos', icon: Calendar },
  { key: 'resumo', label: 'Resumo', icon: BarChart3 },
];

export default function App() {
  const [clientes, setClientes] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('venda');
  const [toast, setToast] = useState(null);

  const loadAll = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    else setSyncing(true);
    try {
      const [c, v] = await Promise.all([
        fetchList(STORAGE_KEYS.clientes),
        fetchList(STORAGE_KEYS.vendas),
      ]);
      setClientes(c);
      setVendas(v);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => { loadAll(false); }, [loadAll]);

  // Keep in sync with a partner using the same shared data — poll periodically.
  useEffect(() => {
    const interval = setInterval(() => { loadAll(true); }, 20000);
    return () => clearInterval(interval);
  }, [loadAll]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSalvar = useCallback(async (venda, novoCliente, resetForm) => {
    setSaving(true);
    try {
      // Read the freshest lists first, in case a partner saved something meanwhile.
      const freshClientes = await fetchList(STORAGE_KEYS.clientes);
      const freshVendas = await fetchList(STORAGE_KEYS.vendas);

      let updatedClientes = freshClientes;
      let codigo = venda.codigoCliente;

      if (novoCliente) {
        codigo = nextCode(freshClientes);
        updatedClientes = [...freshClientes, { ...novoCliente, codigo }];
        try {
          await storageSetWithRetry(STORAGE_KEYS.clientes, updatedClientes);
          setClientes(updatedClientes);
        } catch (err) {
          throw new Error(`Não foi possível salvar o cliente (${err?.message || err}). Toque em "Gravar informações" para tentar de novo.`);
        }
      }

      const finalVenda = { ...venda, codigoCliente: codigo };
      const updatedVendas = [...freshVendas, finalVenda];
      try {
        await storageSetWithRetry(STORAGE_KEYS.vendas, updatedVendas);
        setVendas(updatedVendas);
      } catch (err) {
        throw new Error(`Cliente salvo, mas a venda não foi gravada (${err?.message || err}). Toque em "Gravar informações" para tentar de novo.`);
      }

      setToast({ type: 'success', message: novoCliente ? `Cliente #${codigo} e venda gravados com sucesso.` : 'Venda gravada com sucesso.' });
      resetForm();
    } catch (e) {
      setToast({ type: 'error', message: e?.message || 'Não foi possível salvar agora. Tente novamente.' });
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDeleteVenda = useCallback(async (id) => {
    try {
      const fresh = await fetchList(STORAGE_KEYS.vendas);
      const updated = fresh.filter((v) => v.id !== id);
      await storageSetWithRetry(STORAGE_KEYS.vendas, updated);
      setVendas(updated);
      setToast({ type: 'success', message: 'Venda excluída.' });
    } catch (e) {
      setToast({ type: 'error', message: `Não foi possível excluir agora (${e?.message || e}).` });
    }
  }, []);

  const handleTogglePagamento = useCallback(async (vendaId, parcelaIndex) => {
    try {
      const fresh = await fetchList(STORAGE_KEYS.vendas);
      const updated = fresh.map((v) => {
        if (v.id !== vendaId) return v;
        const pagas = Array.isArray(v.parcelasPagas) ? [...v.parcelasPagas] : Array(v.qtdParcelas || 0).fill(false);
        pagas[parcelaIndex] = !pagas[parcelaIndex];
        return { ...v, parcelasPagas: pagas };
      });
      await storageSetWithRetry(STORAGE_KEYS.vendas, updated);
      setVendas(updated);
    } catch (e) {
      setToast({ type: 'error', message: `Não foi possível atualizar o pagamento agora (${e?.message || e}).` });
    }
  }, []);

  const handleDeleteCliente = useCallback(async (codigo) => {
    try {
      const fresh = await fetchList(STORAGE_KEYS.clientes);
      const updated = fresh.filter((c) => c.codigo !== codigo);
      await storageSetWithRetry(STORAGE_KEYS.clientes, updated);
      setClientes(updated);
      setToast({ type: 'success', message: 'Cliente excluído. As vendas já registradas continuam no histórico.' });
    } catch (e) {
      setToast({ type: 'error', message: `Não foi possível excluir agora (${e?.message || e}).` });
    }
  }, []);

  const activeTabMeta = TABS.find((t) => t.key === tab);

  return (
    <div className="venusex-root min-h-screen flex flex-col" style={{ backgroundColor: theme.bg }}>
      <style>{FONTS}</style>

      {/* Header */}
      <header className="px-5 pt-6 pb-4 flex items-start justify-between" style={{ backgroundColor: theme.primary }}>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Store size={18} style={{ color: theme.accent }} />
            <span className="venusex-display text-lg font-semibold tracking-tight" style={{ color: '#FFFFFF' }}>Vênus Ex.</span>
          </div>
          <div className="text-sm" style={{ color: '#C9CFC9' }}>{activeTabMeta?.label}</div>
        </div>
        <button onClick={() => loadAll(true)} className="p-2 -mr-2 -mt-1 rounded-lg" title="Atualizar dados">
          <RefreshCw size={17} className={syncing ? 'animate-spin' : ''} style={{ color: '#C9CFC9' }} />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-lg w-full mx-auto px-5 pt-5" style={{ paddingBottom: '96px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={22} className="animate-spin" style={{ color: theme.primary }} />
          </div>
        ) : (
          <>
            {tab === 'venda' && <NovaVendaTab clientes={clientes} onSalvar={handleSalvar} saving={saving} />}
            {tab === 'clientes' && <ClientesTab clientes={clientes} onDelete={handleDeleteCliente} />}
            {tab === 'vendas' && <VendasTab vendas={vendas} onDelete={handleDeleteVenda} />}
            {tab === 'agendamentos' && <AgendamentosTab vendas={vendas} onTogglePagamento={handleTogglePagamento} />}
            {tab === 'resumo' && <ResumoTab vendas={vendas} />}
          </>
        )}
      </main>

      <Toast toast={toast} />

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 border-t flex justify-around px-1 py-2 z-40"
        style={{ backgroundColor: '#FFFFFF', borderColor: theme.border, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const activeStyle = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="flex flex-col items-center gap-0.5 px-3 py-1 min-w-[64px]">
              <Icon size={20} style={{ color: activeStyle ? theme.primary : theme.inkSoft }} />
              <span className="text-[11px] font-medium" style={{ color: activeStyle ? theme.primary : theme.inkSoft }}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
