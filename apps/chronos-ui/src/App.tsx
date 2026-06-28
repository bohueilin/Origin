import { Routes, Route, Outlet } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { HomeView } from './views/HomeView'
import { RunRoot } from './views/RunRoot'
import { RunWitness } from './views/RunWitness'
import { PatchView } from './views/PatchView'
import { GateRunning } from './views/GateRunning'
import { GateWitnessFailed } from './views/GateWitnessFailed'
import { GateControlFailed } from './views/GateControlFailed'
import { ReleaseProof } from './views/ReleaseProof'
import { ArtifactsView } from './views/ArtifactsView'
import { BenchmarkView } from './views/BenchmarkView'
import { SettingsView } from './views/SettingsView'

function AppLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomeView />} />
        <Route path="/runs" element={<RunRoot />} />
        <Route path="/witness" element={<RunWitness mode="branch" />} />
        <Route path="/proofset" element={<RunWitness mode="proofset" />} />
        <Route path="/patch" element={<PatchView />} />
        <Route path="/gate" element={<GateRunning />} />
        <Route path="/gate/witness-failed" element={<GateWitnessFailed />} />
        <Route path="/gate/control-failed" element={<GateControlFailed />} />
        <Route path="/releaseproof" element={<ReleaseProof />} />
        <Route path="/artifacts" element={<ArtifactsView />} />
        <Route path="/benchmark" element={<BenchmarkView />} />
        <Route path="/settings" element={<SettingsView />} />
      </Route>
    </Routes>
  )
}
