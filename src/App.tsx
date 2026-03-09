/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react';

const CONFIG = {
  fetchWidth: 4,
  robSize: 24,
  alus: { FP: 4, INT: 2 }
};

const baseInstructions = [
  { id: '1', text: 'vaddps ymm12, ymm9, ymm10', type: 'FP', latency: 3, deps: ['11_prev', '10_prev'] },
  { id: '2', text: 'vcmpltps ymm12, ymm12, ymm4', type: 'FP', latency: 3, deps: ['1'] },
  { id: '3', text: 'vtestps ymm12, ymm12', type: 'FP', latency: 1, deps: ['2'] },
  { id: '4', text: 'je .LBB1_6', type: 'INT', latency: 1, deps: ['3'] },
  { id: '5', text: 'vsubps ymm9, ymm9, ymm10', type: 'FP', latency: 3, deps: ['11_prev', '10_prev'] },
  { id: '6', text: 'vaddps ymm13, ymm9, ymm7', type: 'FP', latency: 3, deps: ['5'] },
  { id: '7', text: 'vaddps ymm9, ymm11, ymm11', type: 'FP', latency: 3, deps: ['12_prev'] },
  { id: '8', text: 'vaddps ymm11, ymm9, ymm6', type: 'FP', latency: 3, deps: ['7'] },
  { id: '9', text: 'vpsubd ymm8, ymm8, ymm12', type: 'FP', latency: 1, deps: ['2', '9_prev'] },
  { id: '10', text: 'vmulps ymm9, ymm13, ymm13', type: 'FP', latency: 3, deps: ['6'] },
  { id: '11', text: 'vmulps ymm10, ymm11, ymm11', type: 'FP', latency: 3, deps: ['8'] },
  { id: '12', text: 'vmulps ymm11, ymm13, ymm11', type: 'FP', latency: 3, deps: ['6', '8'] },
  { id: '13', text: 'dec r8d', type: 'INT', latency: 1, deps: ['13_prev'] },
  { id: '14', text: 'jne .LBB1_4', type: 'INT', latency: 1, deps: ['13'] },
];

function generateWorkload(unrollFactor: number, totalIterations: number) {
  const insts: any[] = [];
  for (let chunk = 0; chunk < totalIterations / unrollFactor; chunk++) {
    const iters = [];
    for (let u = 0; u < unrollFactor; u++) {
      iters.push(chunk * unrollFactor + u);
    }
    for (let i = 0; i < baseInstructions.length; i++) {
      for (let iter of iters) {
        const base = baseInstructions[i];
        const id = `${base.id}_${iter}`;
        const deps = base.deps.map(d => {
          if (d.endsWith('_prev')) {
            const prevIter = iter - unrollFactor;
            if (prevIter < 0) return null; 
            return `${d.split('_')[0]}_${prevIter}`;
          }
          return `${d}_${iter}`;
        }).filter(d => d !== null);
        
        let text = base.text;
        if (unrollFactor > 1) {
            if (iter % unrollFactor !== 0) {
                text = text.replace(/ymm(\d+)/g, (match, p1) => `ymm${parseInt(p1) + 8}`);
            }
        }

        insts.push({
          ...base,
          id,
          deps,
          iter,
          text
        });
      }
    }
  }
  return insts;
}

function simulate(instructions: any[], config: typeof CONFIG) {
  const { fetchWidth, robSize, alus } = config;
  let cycle = 0;
  const states = [];
  
  let queue = [...instructions];
  let rob: any[] = []; 
  let executing: any[] = []; 
  let completed = new Set<string>(); 
  let retiredCount = 0;
  
  while (queue.length > 0 || rob.length > 0) {
    executing = executing.filter(e => {
      if (e.endCycle === cycle) {
        completed.add(e.inst.id);
        const robEntry = rob.find(r => r.inst.id === e.inst.id);
        if (robEntry) robEntry.status = 'DONE';
        return false;
      }
      return true;
    });
    
    let retired = 0;
    while (rob.length > 0 && rob[0].status === 'DONE' && retired < 8) {
      rob.shift();
      retiredCount++;
      retired++;
    }
    
    const availableALUs = { FP: alus.FP, INT: alus.INT };
    const aluState = {
      FP: new Array(alus.FP).fill(null),
      INT: new Array(alus.INT).fill(null)
    };
    
    executing.forEach(e => {
      availableALUs[e.aluType as keyof typeof availableALUs]--;
      aluState[e.aluType as keyof typeof aluState][e.aluIndex] = e;
    });
    
    for (let i = 0; i < rob.length; i++) {
      const entry = rob[i];
      if (entry.status === 'ROB') {
        const ready = entry.inst.deps.every((d: string) => completed.has(d));
        if (ready && availableALUs[entry.inst.type as keyof typeof availableALUs] > 0) {
          const freeIndex = aluState[entry.inst.type as keyof typeof aluState].findIndex(x => x === null);
          if (freeIndex !== -1) {
            entry.status = 'EXECUTING';
            availableALUs[entry.inst.type as keyof typeof availableALUs]--;
            const newExec = {
              inst: entry.inst,
              aluType: entry.inst.type,
              aluIndex: freeIndex,
              endCycle: cycle + entry.inst.latency
            };
            executing.push(newExec);
            aluState[entry.inst.type as keyof typeof aluState][freeIndex] = newExec;
          }
        }
      }
    }
    
    let fetched = 0;
    while (fetched < fetchWidth && queue.length > 0 && rob.length < robSize) {
      const inst = queue.shift();
      rob.push({ inst, status: 'ROB' });
      fetched++;
    }
    
    states.push({
      cycle,
      queue: queue.map(q => ({...q})),
      rob: rob.map(r => ({...r})),
      alus: {
        FP: [...aluState.FP],
        INT: [...aluState.INT]
      },
      completed: new Set(completed),
      retiredCount
    });
    
    cycle++;
    if (cycle > 500) break;
  }
  
  return states;
}

const ITER_COLORS = [
  'bg-blue-500/20 border-blue-500/50 text-blue-300',
  'bg-green-500/20 border-green-500/50 text-green-300',
  'bg-purple-500/20 border-purple-500/50 text-purple-300',
  'bg-orange-500/20 border-orange-500/50 text-orange-300',
  'bg-pink-500/20 border-pink-500/50 text-pink-300',
  'bg-teal-500/20 border-teal-500/50 text-teal-300',
];

const SimulatorView = ({ title, state }: { title: string, state: any }) => {
  if (!state) return null;
  
  const ipc = state.cycle > 0 ? (state.retiredCount / state.cycle).toFixed(2) : "0.00";
  const progress = (state.retiredCount / 56) * 100;

  return (
    <div className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden flex flex-col shadow-xl">
      <div className="p-4 border-b border-[#30363d] flex justify-between items-center bg-[#21262d]/50">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <div className="flex gap-4 text-sm font-mono">
          <div className="flex flex-col items-end">
            <span className="text-gray-400">CYCLE</span>
            <span className="text-xl text-blue-400">{state.cycle}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-gray-400">IPC</span>
            <span className="text-xl text-emerald-400">{ipc}</span>
          </div>
        </div>
      </div>
      
      <div className="h-1 bg-[#0d1117]">
        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="p-4 space-y-6 flex-1">
        
        <div>
          <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Fetch Queue</h3>
          <div className="flex flex-col gap-1 h-[100px] overflow-hidden relative">
            {state.queue.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-600 italic text-sm">Queue Empty</div>
            )}
            {state.queue.slice(0, 4).map((inst: any, i: number) => (
              <div key={i} className={`px-3 py-1.5 rounded border text-xs font-mono flex justify-between items-center ${ITER_COLORS[inst.iter % 6]}`}>
                <span>{inst.text}</span>
                <span className="opacity-50 text-[10px]">Iter {inst.iter}</span>
              </div>
            ))}
            {state.queue.length > 4 && (
              <div className="text-center text-xs text-gray-600 mt-1">+{state.queue.length - 4} more...</div>
            )}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-end mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Reorder Buffer (ROB)</h3>
            <span className="text-xs text-gray-500">{state.rob.length} / 24</span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
            {Array.from({ length: 24 }).map((_, i) => {
              const entry = state.rob[i];
              if (!entry) return <div key={i} className="h-14 bg-[#0d1117] rounded border border-[#30363d]/50" />;
              
              const colorClass = ITER_COLORS[entry.inst.iter % 6];
              const isExecuting = entry.status === 'EXECUTING';
              const isDone = entry.status === 'DONE';
              
              return (
                <div key={i} className={`h-14 p-1.5 rounded border text-[10px] flex flex-col justify-between transition-all ${colorClass} ${isExecuting ? 'ring-1 ring-white/50 shadow-[0_0_10px_rgba(255,255,255,0.2)]' : ''} ${isDone ? 'opacity-40 grayscale' : ''}`}>
                  <div className="font-mono truncate font-bold">{entry.inst.text.split(' ')[0]}</div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="bg-black/30 px-1 rounded">i:{entry.inst.iter}</span>
                    <span className="font-bold">
                      {entry.status === 'ROB' ? 'WAIT' : entry.status === 'EXECUTING' ? 'EXEC' : 'DONE'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Execution Units</h3>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {state.alus.FP.map((exec: any, i: number) => (
              <div key={`fp-${i}`} className="h-20 bg-[#0d1117] rounded-lg border border-[#30363d] p-2 flex flex-col relative overflow-hidden">
                <div className="text-[10px] text-gray-500 font-bold mb-1 z-10">FP ALU {i}</div>
                {exec ? (
                  <>
                    <div className={`flex-1 text-xs font-mono p-1.5 rounded flex flex-col justify-center z-10 ${ITER_COLORS[exec.inst.iter % 6]}`}>
                      <span className="truncate">{exec.inst.text.split(' ')[0]}</span>
                      <span className="text-[9px] opacity-70 truncate">{exec.inst.text.split(' ').slice(1).join(' ')}</span>
                    </div>
                    <div className="absolute bottom-0 left-0 h-1 bg-white/20 w-full z-10">
                      <div 
                        className="h-full bg-white/60 transition-all duration-300" 
                        style={{ width: `${((exec.inst.latency - (exec.endCycle - state.cycle)) / exec.inst.latency) * 100}%` }} 
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-gray-600 italic z-10">IDLE</div>
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {state.alus.INT.map((exec: any, i: number) => (
              <div key={`int-${i}`} className="h-20 bg-[#0d1117] rounded-lg border border-[#30363d] p-2 flex flex-col relative overflow-hidden">
                <div className="text-[10px] text-gray-500 font-bold mb-1 z-10">INT ALU {i}</div>
                {exec ? (
                  <>
                    <div className={`flex-1 text-xs font-mono p-1.5 rounded flex flex-col justify-center z-10 ${ITER_COLORS[exec.inst.iter % 6]}`}>
                      <span className="truncate">{exec.inst.text.split(' ')[0]}</span>
                      <span className="text-[9px] opacity-70 truncate">{exec.inst.text.split(' ').slice(1).join(' ')}</span>
                    </div>
                    <div className="absolute bottom-0 left-0 h-1 bg-white/20 w-full z-10">
                      <div 
                        className="h-full bg-white/60 transition-all duration-300" 
                        style={{ width: `${((exec.inst.latency - (exec.endCycle - state.cycle)) / exec.inst.latency) * 100}%` }} 
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-gray-600 italic z-10">IDLE</div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default function App() {
  const [states1, setStates1] = useState<any[]>([]);
  const [states2, setStates2] = useState<any[]>([]);
  const [currentCycle, setCurrentCycle] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);

  useEffect(() => {
    const insts1 = generateWorkload(1, 4);
    const insts2 = generateWorkload(2, 4);
    setStates1(simulate(insts1, CONFIG));
    setStates2(simulate(insts2, CONFIG));
  }, []);

  const maxCycles = Math.max(states1.length, states2.length);

  useEffect(() => {
    let timer: any;
    if (isPlaying && currentCycle < maxCycles - 1) {
      timer = setTimeout(() => {
        setCurrentCycle(c => c + 1);
      }, speed);
    } else if (currentCycle >= maxCycles - 1) {
      setIsPlaying(false);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, currentCycle, maxCycles, speed]);

  if (states1.length === 0 || states2.length === 0) return null;

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row justify-between items-center bg-[#161b22] p-4 rounded-xl border border-[#30363d] shadow-lg">
          <div>
            <h1 className="text-2xl font-bold text-white">Mandelbrot ILP Showcase</h1>
            <p className="text-sm text-gray-400">Mandelbrot Loop: Non-Unrolled vs Unrolled</p>
          </div>
          
          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <div className="flex bg-[#0d1117] rounded-lg p-1 border border-[#30363d]">
              <button onClick={() => setIsPlaying(!isPlaying)} className="p-2 hover:bg-[#21262d] rounded text-white transition-colors">
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button onClick={() => setCurrentCycle(c => Math.min(maxCycles - 1, c + 1))} className="p-2 hover:bg-[#21262d] rounded text-white transition-colors">
                <SkipForward size={20} />
              </button>
              <button onClick={() => { setCurrentCycle(0); setIsPlaying(false); }} className="p-2 hover:bg-[#21262d] rounded text-white transition-colors">
                <RotateCcw size={20} />
              </button>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">Speed:</span>
              <select 
                value={speed} 
                onChange={e => setSpeed(Number(e.target.value))}
                className="bg-[#0d1117] border border-[#30363d] rounded p-1.5 text-white outline-none focus:border-blue-500"
              >
                <option value={2000}>1x (Slow)</option>
                <option value={1000}>2x (Normal)</option>
                <option value={500}>5x (Fast)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <SimulatorView title="Non-Unrolled (1x)" state={states1[Math.min(currentCycle, states1.length - 1)]} />
          <SimulatorView title="Unrolled (2x)" state={states2[Math.min(currentCycle, states2.length - 1)]} />
        </div>

      </div>
    </div>
  );
}

