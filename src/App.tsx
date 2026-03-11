import React, { useState, useEffect, useMemo } from 'react';
import { Play, Square, ChevronLeft, ChevronRight, Settings2, FastForward, Rewind } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Instruction Templates ---

const nonUnrolledTemplate = [
  { id: "I1", op: "vaddps", type: "FP", latency: 3, deps: [{id:"I10", prev:true}, {id:"I11", prev:true}] },
  { id: "I2", op: "vcmpltps", type: "FP", latency: 3, deps: [{id:"I1", prev:false}] },
  { id: "I3", op: "vtestps", type: "FP", latency: 1, deps: [{id:"I2", prev:false}] },
  { id: "I4", op: "je", type: "INT", latency: 1, deps: [{id:"I3", prev:false}] },
  { id: "I5", op: "vsubps", type: "FP", latency: 3, deps: [{id:"I10", prev:true}, {id:"I11", prev:true}] },
  { id: "I6", op: "vaddps", type: "FP", latency: 3, deps: [{id:"I5", prev:false}] },
  { id: "I7", op: "vaddps", type: "FP", latency: 3, deps: [{id:"I12", prev:true}] },
  { id: "I8", op: "vaddps", type: "FP", latency: 3, deps: [{id:"I7", prev:false}] },
  { id: "I9", op: "vpsubd", type: "FP", latency: 1, deps: [{id:"I2", prev:false}, {id:"I9", prev:true}] },
  { id: "I10", op: "vmulps", type: "FP", latency: 3, deps: [{id:"I6", prev:false}] },
  { id: "I11", op: "vmulps", type: "FP", latency: 3, deps: [{id:"I8", prev:false}] },
  { id: "I12", op: "vmulps", type: "FP", latency: 3, deps: [{id:"I6", prev:false}, {id:"I8", prev:false}] },
  { id: "I13", op: "dec", type: "INT", latency: 1, deps: [{id:"I13", prev:true}] },
  { id: "I14", op: "jne", type: "INT", latency: 1, deps: [{id:"I13", prev:false}] }
];

const unrolledTemplate = [
  { id: "I1", op: "vaddps", type: "FP", latency: 3, deps: [{id:"I23", prev:true}, {id:"I25", prev:true}] },
  { id: "I2", op: "vaddps", type: "FP", latency: 3, deps: [{id:"I24", prev:true}, {id:"I26", prev:true}] },
  { id: "I3", op: "vcmpltps", type: "FP", latency: 3, deps: [{id:"I1", prev:false}] },
  { id: "I4", op: "vextractf128", type: "FP", latency: 1, deps: [{id:"I3", prev:false}] },
  { id: "I5", op: "vpackssdw", type: "FP", latency: 1, deps: [{id:"I3", prev:false}, {id:"I4", prev:false}] },
  { id: "I6", op: "vcmpltps", type: "FP", latency: 3, deps: [{id:"I2", prev:false}] },
  { id: "I7", op: "vextractf128", type: "FP", latency: 1, deps: [{id:"I6", prev:false}] },
  { id: "I8", op: "vpackssdw", type: "FP", latency: 1, deps: [{id:"I6", prev:false}, {id:"I7", prev:false}] },
  { id: "I9", op: "vpacksswb", type: "FP", latency: 1, deps: [{id:"I8", prev:false}, {id:"I5", prev:false}] },
  { id: "I10", op: "vpmovmskb", type: "FP", latency: 1, deps: [{id:"I9", prev:false}] },
  { id: "I11", op: "test", type: "INT", latency: 1, deps: [{id:"I10", prev:false}] },
  { id: "I12", op: "je", type: "INT", latency: 1, deps: [{id:"I11", prev:false}] },
  { id: "I13", op: "vsubps", type: "FP", latency: 3, deps: [{id:"I23", prev:true}, {id:"I25", prev:true}] },
  { id: "I14", op: "vaddps", type: "FP", latency: 3, deps: [{id:"I13", prev:false}] },
  { id: "I15", op: "vsubps", type: "FP", latency: 3, deps: [{id:"I24", prev:true}, {id:"I26", prev:true}] },
  { id: "I16", op: "vaddps", type: "FP", latency: 3, deps: [{id:"I15", prev:false}] },
  { id: "I17", op: "vaddps", type: "FP", latency: 3, deps: [{id:"I27", prev:true}] },
  { id: "I18", op: "vaddps", type: "FP", latency: 3, deps: [{id:"I17", prev:false}] },
  { id: "I19", op: "vaddps", type: "FP", latency: 3, deps: [{id:"I28", prev:true}] },
  { id: "I20", op: "vaddps", type: "FP", latency: 3, deps: [{id:"I19", prev:false}] },
  { id: "I21", op: "vpsubd", type: "FP", latency: 1, deps: [{id:"I3", prev:false}, {id:"I21", prev:true}] },
  { id: "I22", op: "vpsubd", type: "FP", latency: 1, deps: [{id:"I6", prev:false}, {id:"I22", prev:true}] },
  { id: "I23", op: "vmulps", type: "FP", latency: 3, deps: [{id:"I14", prev:false}] },
  { id: "I24", op: "vmulps", type: "FP", latency: 3, deps: [{id:"I16", prev:false}] },
  { id: "I25", op: "vmulps", type: "FP", latency: 3, deps: [{id:"I18", prev:false}] },
  { id: "I26", op: "vmulps", type: "FP", latency: 3, deps: [{id:"I20", prev:false}] },
  { id: "I27", op: "vmulps", type: "FP", latency: 3, deps: [{id:"I14", prev:false}, {id:"I18", prev:false}] },
  { id: "I28", op: "vmulps", type: "FP", latency: 3, deps: [{id:"I20", prev:false}, {id:"I16", prev:false}] },
  { id: "I29", op: "dec", type: "INT", latency: 1, deps: [{id:"I29", prev:true}] },
  { id: "I30", op: "jne", type: "INT", latency: 1, deps: [{id:"I29", prev:false}] }
];

// --- Simulation Logic ---

function generateProgram(template: any[], iterations: number) {
  let program = [];
  for (let iter = 0; iter < iterations; iter++) {
    for (let inst of template) {
      let deps = inst.deps.map((d: any) => {
        let depIter = d.prev ? iter - 1 : iter;
        return `${depIter}_${d.id}`;
      });
      deps = deps.filter((d: string) => !d.startsWith("-1_"));
      program.push({
        uid: `${iter}_${inst.id}`,
        iter: iter,
        id: inst.id,
        op: inst.op,
        type: inst.type,
        latency: inst.latency,
        deps: deps
      });
    }
  }
  return program;
}

function simulateAll(program: any[]) {
  let history = [];
  let state = {
    cycle: 0,
    pc: 0,
    rob: [] as any[],
    execUnits: { FP: [null, null, null, null], INT: [null, null] } as Record<string, any[]>,
    completed: new Set<string>(),
    stats: { fetched: 0, issued: 0, retired: 0, fp_busy: 0, int_busy: 0 }
  };
  
  const cloneState = (s: typeof state) => ({
    cycle: s.cycle,
    pc: s.pc,
    rob: s.rob.map(inst => ({...inst})),
    execUnits: {
      FP: s.execUnits.FP.map(u => u ? {...u} : null),
      INT: s.execUnits.INT.map(u => u ? {...u} : null)
    },
    completed: new Set(s.completed),
    stats: {...s.stats}
  });

  history.push(cloneState(state));

  while (state.pc < program.length || state.rob.length > 0) {
    // 1. Retire
    let retiredThisCycle = 0;
    while (state.rob.length > 0 && state.rob[0].status === 'done' && retiredThisCycle < 4) {
      state.rob.shift();
      retiredThisCycle++;
      state.stats.retired++;
    }

    // 2. Execute
    let fpBusy = 0;
    let intBusy = 0;
    for (let type of ['FP', 'INT']) {
      for (let i = 0; i < state.execUnits[type].length; i++) {
        let unit = state.execUnits[type][i];
        if (unit) {
          if (type === 'FP') fpBusy++;
          if (type === 'INT') intBusy++;
          unit.remaining--;
          if (unit.remaining === 0) {
            let robInst = state.rob.find(inst => inst.uid === unit.uid);
            if (robInst) robInst.status = 'done';
            state.completed.add(unit.uid);
            state.execUnits[type][i] = null;
          }
        }
      }
    }
    state.stats.fp_busy += fpBusy;
    state.stats.int_busy += intBusy;

    // 3. Issue
    for (let robInst of state.rob) {
      if (robInst.status === 'wait') {
        let ready = true;
        for (let dep of robInst.deps) {
          if (!state.completed.has(dep)) {
            ready = false;
            break;
          }
        }
        if (ready) {
          let freeIdx = state.execUnits[robInst.type].findIndex(u => u === null);
          if (freeIdx !== -1) {
            state.execUnits[robInst.type][freeIdx] = { ...robInst, remaining: robInst.latency };
            robInst.status = 'exec';
            state.stats.issued++;
          }
        }
      }
    }

    // 4. Fetch
    let fetchedThisCycle = 0;
    while (state.rob.length < 24 && fetchedThisCycle < 4 && state.pc < program.length) {
      let inst = program[state.pc];
      state.rob.push({ ...inst, status: 'wait' });
      state.pc++;
      fetchedThisCycle++;
      state.stats.fetched++;
    }

    state.cycle++;
    history.push(cloneState(state));
  }
  
  return history;
}

// --- UI Components ---

const iterColors = [
  'bg-blue-900/40 border-blue-500/50 text-blue-200',
  'bg-emerald-900/40 border-emerald-500/50 text-emerald-200',
  'bg-amber-900/40 border-amber-500/50 text-amber-200',
  'bg-rose-900/40 border-rose-500/50 text-rose-200',
  'bg-fuchsia-900/40 border-fuchsia-500/50 text-fuchsia-200',
  'bg-cyan-900/40 border-cyan-500/50 text-cyan-200',
  'bg-lime-900/40 border-lime-500/50 text-lime-200',
  'bg-violet-900/40 border-violet-500/50 text-violet-200'
];

const getIterColor = (iter: number) => iterColors[iter % iterColors.length];

const simplifyOp = (op: string) => {
  const map: Record<string, string> = {
    vaddps: 'add', vcmpltps: 'cmp', vtestps: 'test', je: 'je',
    vsubps: 'sub', vpsubd: 'sub', vmulps: 'mul', dec: 'dec', jne: 'jne',
    vextractf128: 'extr', vpackssdw: 'pack', vpacksswb: 'pack',
    vpmovmskb: 'movmsk', test: 'test'
  };
  return map[op] || op;
};

const getRegisters = (inst: any) => {
  const op = inst.op;
  const dest = 'r' + inst.id.substring(1);
  const srcs = inst.deps.map((d: string) => 'r' + d.split('_')[1].substring(1));
  
  if (op === 'je' || op === 'jne') return ' .loop';
  if (op === 'dec') return ` ${dest}`;
  
  if (op === 'vtestps' || op === 'test') {
    return ` ${srcs[0] || dest}, ${srcs[1] || srcs[0] || dest}`;
  }
  
  if (op === 'vpmovmskb') {
    return ` ${dest}, ${srcs[0] || 'r0'}`;
  }
  
  if (op === 'vextractf128') {
    return ` ${dest}, ${srcs[0] || 'r0'}, 1`;
  }
  
  const src1 = srcs[0] || 'r0';
  const src2 = srcs.length > 1 ? srcs[1] : 'r0';
  
  return ` ${dest}, ${src1}, ${src2}`;
};

const InstCard = ({ inst, simplify, className = "", hideStatus = false, showRegisters = false }: any) => {
  if (!inst) return null;
  
  const color = getIterColor(inst.iter);
  let opName = simplify ? simplifyOp(inst.op) : inst.op;
  
  if (showRegisters) {
    opName += getRegisters(inst);
  }
  
  let statusStyle = "";
  if (inst.status === 'exec') {
    statusStyle = "shadow-[0_0_12px_rgba(255,255,255,0.3)] border-white/60 brightness-125";
  } else if (inst.status === 'done') {
    statusStyle = "opacity-40 grayscale border-white/10";
  }
  
  return (
    <div className={`flex flex-col justify-center items-center rounded border text-[10px] font-mono relative overflow-hidden ${color} ${statusStyle} ${className}`}>
      <span className="absolute top-0.5 left-1 text-[8px] opacity-70">i:{inst.iter}</span>
      {inst.status && !hideStatus && (
        <span className="absolute top-0.5 right-1 text-[7px] font-bold opacity-70 uppercase">{inst.status}</span>
      )}
      <span className="font-bold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis px-1 max-w-full text-center">{opName}</span>
    </div>
  );
};

const Window = ({ title, history, currentCycle, program, simplify }: any) => {
  const state = history[Math.min(currentCycle, history.length - 1)];
  
  const ipc = state.cycle > 0 ? (state.stats.retired / state.cycle).toFixed(2) : "0.00";
  const fpUtil = state.cycle > 0 ? ((state.stats.fp_busy / (state.cycle * 4)) * 100).toFixed(1) : "0.0";
  const intUtil = state.cycle > 0 ? ((state.stats.int_busy / (state.cycle * 2)) * 100).toFixed(1) : "0.0";

  return (
    <div className="flex flex-col gap-4 p-5 bg-zinc-900 rounded-xl border border-white/10 shadow-2xl">
      <div className="flex justify-between items-center border-b border-white/10 pb-3">
        <h2 className="text-lg font-bold text-white tracking-tight">{title}</h2>
        <div className="flex gap-4 text-xs font-mono text-zinc-400 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
          <div>Cycle: <span className="text-white font-semibold">{state.cycle}</span></div>
          <div>IPC: <span className="text-emerald-400 font-semibold">{ipc}</span></div>
          <div>FP Util: <span className="text-blue-400 font-semibold">{fpUtil}%</span></div>
          <div>INT Util: <span className="text-amber-400 font-semibold">{intUtil}%</span></div>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-6">
        {/* Fetch Queue */}
        <div className="col-span-1 flex flex-col gap-2">
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Fetch Queue</h3>
          <div className="relative h-[340px] overflow-hidden bg-black/60 p-2 rounded-lg border border-white/5 shadow-inner">
            <motion.div 
              className="flex flex-col gap-1 absolute top-2 w-[calc(100%-16px)]"
              animate={{ y: (1 - Math.max(0, state.pc - 4)) * 52 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {program.map((inst: any, i: number) => {
                if (Math.abs(i - state.pc) > 15) return <div key={inst.uid} className="h-12 shrink-0" />;
                
                const activeStart = Math.max(0, state.pc - 4);
                const isActive = i >= activeStart && i < state.pc;
                const opacity = isActive ? "opacity-100" : "opacity-40 grayscale";
                
                return (
                  <InstCard 
                    key={inst.uid}
                    inst={inst} 
                    simplify={simplify} 
                    className={`h-12 shrink-0 ${opacity} transition-all duration-300`} 
                    hideStatus={true}
                    showRegisters={true}
                  />
                );
              })}
            </motion.div>
          </div>
        </div>
        
        {/* ROB */}
        <div className="col-span-2 flex flex-col gap-2">
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Reorder Buffer (ROB)</h3>
          <div className="grid grid-cols-4 gap-1.5 bg-black/60 p-2 rounded-lg border border-white/5 h-[340px] content-start shadow-inner overflow-hidden">
            <AnimatePresence>
              {state.rob.map((inst: any) => (
                <motion.div 
                  key={inst.uid} 
                  layout 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                >
                  <InstCard inst={inst} simplify={simplify} className="h-12 w-full" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
      
      {/* Execution Units */}
      <div className="flex flex-col gap-4 mt-2">
        <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Execution Units</h3>
        
        {/* FP ALUs */}
        <div className="grid grid-cols-4 gap-4">
          {state.execUnits.FP.map((unit: any, i: number) => (
            <div key={`fp-${i}`} className="flex flex-col gap-1.5 bg-black/40 p-2 rounded-lg border border-white/5 shadow-inner">
              <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold text-center">FP ALU {i}</div>
              <div className="h-12 rounded border border-white/10 bg-black/60 relative overflow-hidden">
                <AnimatePresence>
                  {unit && (
                    <motion.div 
                      key={unit.uid}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute inset-0"
                    >
                      <InstCard inst={unit} simplify={simplify} className="h-full w-full border-none" hideStatus={true} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="h-1.5 bg-black/80 rounded-full overflow-hidden border border-white/5">
                {unit && (
                  <div 
                    className="h-full bg-blue-500 transition-all duration-200 ease-linear"
                    style={{ width: `${((unit.latency - unit.remaining + 1) / unit.latency) * 100}%` }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* INT ALUs */}
        <div className="grid grid-cols-4 gap-4">
          {state.execUnits.INT.map((unit: any, i: number) => (
            <div key={`int-${i}`} className="flex flex-col gap-1.5 bg-black/40 p-2 rounded-lg border border-white/5 shadow-inner">
              <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold text-center">INT ALU {i}</div>
              <div className="h-12 rounded border border-white/10 bg-black/60 relative overflow-hidden">
                <AnimatePresence>
                  {unit && (
                    <motion.div 
                      key={unit.uid}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute inset-0"
                    >
                      <InstCard inst={unit} simplify={simplify} className="h-full w-full border-none" hideStatus={true} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="h-1.5 bg-black/80 rounded-full overflow-hidden border border-white/5">
                {unit && (
                  <div 
                    className="h-full bg-amber-500 transition-all duration-200 ease-linear"
                    style={{ width: `${((unit.latency - unit.remaining + 1) / unit.latency) * 100}%` }}
                  />
                )}
              </div>
            </div>
          ))}
          <div className="col-span-2"></div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [speed, setSpeed] = useState(900);
  const [simplify, setSimplify] = useState(true);

  const { nonUnrolledProgram, unrolledProgram, nonUnrolledHistory, unrolledHistory, maxCycle } = useMemo(() => {
    const p1 = generateProgram(nonUnrolledTemplate, 16);
    const p2 = generateProgram(unrolledTemplate, 8);
    const h1 = simulateAll(p1);
    const h2 = simulateAll(p2);
    return {
      nonUnrolledProgram: p1,
      unrolledProgram: p2,
      nonUnrolledHistory: h1,
      unrolledHistory: h2,
      maxCycle: Math.max(h1.length, h2.length) - 1
    };
  }, []);

  useEffect(() => {
    let interval: any;
    if (playing && cycle < maxCycle) {
      interval = setInterval(() => {
        setCycle(c => Math.min(c + 1, maxCycle));
      }, speed);
    } else if (cycle >= maxCycle) {
      setPlaying(false);
    }
    return () => clearInterval(interval);
  }, [playing, cycle, speed, maxCycle]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCycle(parseInt(e.target.value));
  };

  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-zinc-900 p-4 rounded-xl border border-white/10 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-emerald-500/20 rounded-lg flex items-center justify-center border border-emerald-500/50">
            <Settings2 className="text-emerald-400" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Mandelbrot ILP Showcase</h1>
            <p className="text-xs text-zinc-400">Instruction Level Parallelism: Unrolled vs Non-Unrolled</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-lg border border-white/5">
            <button 
              onClick={() => setCycle(0)}
              className="p-2 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors"
              title="Reset"
            >
              <Rewind size={18} />
            </button>
            <button 
              onClick={() => setCycle(c => Math.max(0, c - 1))}
              className="p-2 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors"
              title="Previous Cycle"
            >
              <ChevronLeft size={18} />
            </button>
            <button 
              onClick={() => setPlaying(!playing)}
              className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded transition-colors w-10 flex justify-center"
            >
              {playing ? <Square size={18} /> : <Play size={18} className="ml-1" />}
            </button>
            <button 
              onClick={() => setCycle(c => Math.min(maxCycle, c + 1))}
              className="p-2 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors"
              title="Next Cycle"
            >
              <ChevronRight size={18} />
            </button>
            <button 
              onClick={() => setCycle(maxCycle)}
              className="p-2 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors"
              title="End"
            >
              <FastForward size={18} />
            </button>
          </div>

          <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-lg border border-white/5">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Speed</span>
            <div className="flex gap-1">
              {[
                { label: 'Slow', value: 2250 },
                { label: 'Normal', value: 900 },
                { label: 'Fast', value: 300 }
              ].map(s => (
                <button
                  key={s.label}
                  onClick={() => setSpeed(s.value)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${speed === s.value ? 'bg-white/20 text-white' : 'text-zinc-400 hover:bg-white/10'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer bg-black/40 px-4 py-2 rounded-lg border border-white/5">
            <input 
              type="checkbox" 
              checked={simplify} 
              onChange={e => setSimplify(e.target.checked)}
              className="accent-emerald-500"
            />
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Simplify Ops</span>
          </label>
        </div>
      </div>

      {/* Timeline Scrubber */}
      <div className="bg-zinc-900 p-4 rounded-xl border border-white/10 shadow-lg flex items-center gap-4">
        <span className="text-xs font-mono text-zinc-500 w-12 text-right">{cycle}</span>
        <input 
          type="range" 
          min="0" 
          max={maxCycle} 
          value={cycle} 
          onChange={handleSeek}
          className="flex-1 h-2 bg-black/60 rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />
        <span className="text-xs font-mono text-zinc-500 w-12">{maxCycle}</span>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
        <Window 
          title="Non-Unrolled" 
          history={nonUnrolledHistory} 
          currentCycle={cycle} 
          program={nonUnrolledProgram}
          simplify={simplify}
        />
        <Window 
          title="Unrolled 2x" 
          history={unrolledHistory} 
          currentCycle={cycle} 
          program={unrolledProgram}
          simplify={simplify}
        />
      </div>
    </div>
  );
}
