import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
  useViewport,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type Rect,
  type Viewport,
} from '@xyflow/react'
import { Maximize2, Minus, Plus } from './icons'
import { nodeTypes } from '../nodes/nodes'
import { edgeTypes } from '../nodes/ClusterEdge'

const DEFAULT_FIT_MAX_ZOOM = 0.62
const ENTER_ANIMATION_MS = 2200
const LAYER_STAGGER_MS = 38
const REVEAL_AFTER_FIT_MS = 620
const ESTIMATED_NODE_WIDTH = 250
const ESTIMATED_NODE_HEIGHT = 112

function getEstimatedNodesBounds(nodes: Node[]): Rect | null {
  if (nodes.length === 0) return null

  const left = Math.min(...nodes.map((node) => node.position.x))
  const top = Math.min(...nodes.map((node) => node.position.y))
  const right = Math.max(...nodes.map((node) => node.position.x + ESTIMATED_NODE_WIDTH))
  const bottom = Math.max(...nodes.map((node) => node.position.y + ESTIMATED_NODE_HEIGHT))

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function getCenteredViewport(bounds: Rect, width: number, height: number, minZoom: number, maxZoom: number, padding: number): Viewport {
  const paddedWidth = Math.max(width * (1 - padding * 2), 1)
  const paddedHeight = Math.max(height * (1 - padding * 2), 1)
  const fitZoom = Math.min(paddedWidth / bounds.width, paddedHeight / bounds.height)
  const zoom = Math.min(maxZoom, Math.max(minZoom, fitZoom))

  return {
    x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  }
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const update = () => {
      const { width, height } = element.getBoundingClientRect()
      setSize({ width, height })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}

function ZoomBar() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  const zoomPercent = `${Math.round(zoom * 100)}%`

  return (
    <div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-lg border border-hairline bg-surface-raised p-1 shadow-sm">
      <button type="button" aria-label="Fit graph" onClick={() => fitView({ duration: 180 })} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-tertiary transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface hover:text-ink-secondary active:scale-[0.94] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Maximize2 size={14} />
      </button>
      <button type="button" aria-label="Zoom out" onClick={() => zoomOut({ duration: 160 })} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-tertiary transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface hover:text-ink-secondary active:scale-[0.94] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Minus size={15} />
      </button>
      <span className="min-w-10 px-1 text-center text-xs font-medium text-ink-secondary-strong" aria-live="polite">
        {zoomPercent}
      </span>
      <button type="button" aria-label="Zoom in" onClick={() => zoomIn({ duration: 160 })} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-tertiary transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface hover:text-ink-secondary active:scale-[0.94] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Plus size={15} />
      </button>
    </div>
  )
}

function FlowInner({
  nodes,
  edges,
  onNodeClick,
  fitPadding,
  fitMaxZoom,
  fitMinZoom,
  initialViewport,
  interactive,
  children,
}: {
  nodes: Node[]
  edges: Edge[]
  onNodeClick?: NodeMouseHandler
  fitPadding: number
  fitMaxZoom: number
  fitMinZoom: number
  initialViewport?: Viewport
  interactive: boolean
  children?: ReactNode
}) {
  const { getViewport, setViewport } = useReactFlow()
  const [flowReady, setFlowReady] = useState(false)
  const [initialViewportApplied, setInitialViewportApplied] = useState(false)
  const flowRootRef = useRef<HTMLDivElement | null>(null)
  const lastFitSignature = useRef<string | null>(null)
  const fitFrame = useRef<number | null>(null)
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seenNodeIds = useRef<Set<string> | null>(null)
  const seenEdgeIds = useRef<Set<string> | null>(null)
  const nodeEnterTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const edgeEnterTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const nodeRevealTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const edgeRevealTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const nodeRevealFrames = useRef<Map<string, number>>(new Map())
  const edgeRevealFrames = useRef<Map<string, number>>(new Map())
  const [enteringNodeIds, setEnteringNodeIds] = useState<Set<string>>(() => new Set())
  const [enteringEdgeIds, setEnteringEdgeIds] = useState<Set<string>>(() => new Set())
  const [revealedNodeIds, setRevealedNodeIds] = useState<Set<string>>(() => new Set())
  const [revealedEdgeIds, setRevealedEdgeIds] = useState<Set<string>>(() => new Set())
  const nodeIds = useMemo(() => nodes.map((node) => node.id), [nodes])
  const edgeIds = useMemo(() => edges.map((edge) => edge.id), [edges])
  const nodeTopologySignature = useMemo(() => nodeIds.join('|'), [nodeIds])
  const edgeTopologySignature = useMemo(() => edgeIds.join('|'), [edgeIds])
  const fitSignature = useMemo(() => {
    if (nodes.length === 0) return null
    const deepestLayer = Math.max(...nodes.map((node) => node.position.y))
    return `${nodes.length}:${deepestLayer}`
  }, [nodes])

  const layerDelayByNodeId = useMemo(() => {
    const layers = [...new Set(nodes.map((node) => node.position.y))].sort((a, b) => a - b)
    const layerIndex = new Map(layers.map((layer, index) => [layer, index]))
    return new Map(nodes.map((node) => [node.id, (layerIndex.get(node.position.y) ?? 0) * LAYER_STAGGER_MS]))
  }, [nodes])

  const animatedNodes = useMemo(() => {
    const seen = seenNodeIds.current
    return nodes.map((node) => {
      const isNew = seen !== null && !seen.has(node.id)
      const isEntering = isNew || enteringNodeIds.has(node.id)
      if (!isEntering) return node

      const isRevealed = revealedNodeIds.has(node.id)
      const className = ['fp-enter', isRevealed && 'fp-enter-revealed', node.className].filter(Boolean).join(' ')
      const enterDelay = layerDelayByNodeId.get(node.id) ?? 0
      const style = { ...node.style, '--fp-enter-delay': `${enterDelay}ms` } as CSSProperties
      return { ...node, className, style }
    })
  }, [nodes, enteringNodeIds, revealedNodeIds, layerDelayByNodeId])

  const animatedEdges = useMemo(() => {
    const seen = seenEdgeIds.current
    return edges.map((edge) => {
      const isNew = seen !== null && !seen.has(edge.id)
      const isEntering = isNew || enteringEdgeIds.has(edge.id)
      const sourceDelay = layerDelayByNodeId.get(edge.source) ?? 0
      const targetDelay = layerDelayByNodeId.get(edge.target) ?? sourceDelay
      const enterDelay = Math.max(sourceDelay, targetDelay) + 24
      return isEntering
        ? { ...edge, data: { ...(edge.data ?? {}), entering: true, revealed: revealedEdgeIds.has(edge.id), enterDelay: `${enterDelay}ms` } }
        : edge
    })
  }, [edges, enteringEdgeIds, revealedEdgeIds, layerDelayByNodeId])

  const clearNodeAnimation = useCallback((id: string) => {
    const enterTimer = nodeEnterTimers.current.get(id)
    if (enterTimer) clearTimeout(enterTimer)
    nodeEnterTimers.current.delete(id)

    const revealTimer = nodeRevealTimers.current.get(id)
    if (revealTimer) clearTimeout(revealTimer)
    nodeRevealTimers.current.delete(id)

    const revealFrame = nodeRevealFrames.current.get(id)
    if (revealFrame) cancelAnimationFrame(revealFrame)
    nodeRevealFrames.current.delete(id)
  }, [])

  const clearEdgeAnimation = useCallback((id: string) => {
    const enterTimer = edgeEnterTimers.current.get(id)
    if (enterTimer) clearTimeout(enterTimer)
    edgeEnterTimers.current.delete(id)

    const revealTimer = edgeRevealTimers.current.get(id)
    if (revealTimer) clearTimeout(revealTimer)
    edgeRevealTimers.current.delete(id)

    const revealFrame = edgeRevealFrames.current.get(id)
    if (revealFrame) cancelAnimationFrame(revealFrame)
    edgeRevealFrames.current.delete(id)
  }, [])

  useEffect(() => {
    if (nodeIds.length === 0 && seenNodeIds.current === null) return
    const nextIds = new Set(nodeIds)
    const previousIds = seenNodeIds.current
    const removedIds = previousIds ? [...previousIds].filter((id) => !nextIds.has(id)) : []

    if (previousIds) {
      const addedIds = [...nextIds].filter((id) => !previousIds.has(id))
      if (removedIds.length) {
        removedIds.forEach(clearNodeAnimation)
        setEnteringNodeIds((current) => {
          const next = new Set(current)
          removedIds.forEach((id) => next.delete(id))
          return next
        })
        setRevealedNodeIds((current) => {
          const next = new Set(current)
          removedIds.forEach((id) => next.delete(id))
          return next
        })
      }
      if (addedIds.length) {
        setEnteringNodeIds((current) => new Set([...current, ...addedIds]))
        setRevealedNodeIds((current) => {
          const next = new Set(current)
          addedIds.forEach((id) => next.delete(id))
          return next
        })
        addedIds.forEach((id) => {
          clearNodeAnimation(id)
          const revealTimer = setTimeout(() => {
            nodeRevealTimers.current.delete(id)
            const frame = requestAnimationFrame(() => {
              nodeRevealFrames.current.delete(id)
              if (!seenNodeIds.current?.has(id)) return
              setRevealedNodeIds((current) => new Set([...current, id]))
            })
            nodeRevealFrames.current.set(id, frame)
          }, REVEAL_AFTER_FIT_MS)
          nodeRevealTimers.current.set(id, revealTimer)
          const timer = setTimeout(() => {
            nodeEnterTimers.current.delete(id)
            if (!seenNodeIds.current?.has(id)) return
            setEnteringNodeIds((current) => {
              const next = new Set(current)
              next.delete(id)
              return next
            })
            setRevealedNodeIds((current) => {
              const next = new Set(current)
              next.delete(id)
              return next
            })
          }, ENTER_ANIMATION_MS)
          nodeEnterTimers.current.set(id, timer)
        })
      }
    }

    seenNodeIds.current = nextIds
  }, [nodeTopologySignature, clearNodeAnimation])

  useEffect(() => {
    const nextIds = new Set(edgeIds)
    const previousIds = seenEdgeIds.current
    const removedIds = previousIds ? [...previousIds].filter((id) => !nextIds.has(id)) : []

    if (previousIds) {
      const addedIds = [...nextIds].filter((id) => !previousIds.has(id))
      if (removedIds.length) {
        removedIds.forEach(clearEdgeAnimation)
        setEnteringEdgeIds((current) => {
          const next = new Set(current)
          removedIds.forEach((id) => next.delete(id))
          return next
        })
        setRevealedEdgeIds((current) => {
          const next = new Set(current)
          removedIds.forEach((id) => next.delete(id))
          return next
        })
      }
      if (addedIds.length) {
        setEnteringEdgeIds((current) => new Set([...current, ...addedIds]))
        setRevealedEdgeIds((current) => {
          const next = new Set(current)
          addedIds.forEach((id) => next.delete(id))
          return next
        })
        addedIds.forEach((id) => {
          clearEdgeAnimation(id)
          const revealTimer = setTimeout(() => {
            edgeRevealTimers.current.delete(id)
            const frame = requestAnimationFrame(() => {
              edgeRevealFrames.current.delete(id)
              if (!seenEdgeIds.current?.has(id)) return
              setRevealedEdgeIds((current) => new Set([...current, id]))
            })
            edgeRevealFrames.current.set(id, frame)
          }, REVEAL_AFTER_FIT_MS)
          edgeRevealTimers.current.set(id, revealTimer)
          const timer = setTimeout(() => {
            edgeEnterTimers.current.delete(id)
            if (!seenEdgeIds.current?.has(id)) return
            setEnteringEdgeIds((current) => {
              const next = new Set(current)
              next.delete(id)
              return next
            })
            setRevealedEdgeIds((current) => {
              const next = new Set(current)
              next.delete(id)
              return next
            })
          }, ENTER_ANIMATION_MS)
          edgeEnterTimers.current.set(id, timer)
        })
      }
    }

    seenEdgeIds.current = nextIds
  }, [edgeTopologySignature, clearEdgeAnimation])

  useEffect(() => {
    return () => {
      nodeEnterTimers.current.forEach((timer) => clearTimeout(timer))
      edgeEnterTimers.current.forEach((timer) => clearTimeout(timer))
      nodeRevealTimers.current.forEach((timer) => clearTimeout(timer))
      edgeRevealTimers.current.forEach((timer) => clearTimeout(timer))
      nodeRevealFrames.current.forEach((frame) => cancelAnimationFrame(frame))
      edgeRevealFrames.current.forEach((frame) => cancelAnimationFrame(frame))
      if (fitFrame.current) cancelAnimationFrame(fitFrame.current)
      if (fitTimer.current) clearTimeout(fitTimer.current)
      nodeEnterTimers.current.clear()
      edgeEnterTimers.current.clear()
      nodeRevealTimers.current.clear()
      edgeRevealTimers.current.clear()
      nodeRevealFrames.current.clear()
      edgeRevealFrames.current.clear()
      fitFrame.current = null
      fitTimer.current = null
    }
  }, [])

  useEffect(() => {
    if (nodes.length === 0) setInitialViewportApplied(false)
  }, [nodes.length])

  useLayoutEffect(() => {
    if (!flowReady || nodes.length === 0 || !fitSignature || !initialViewport) return
    if (lastFitSignature.current !== null) return

    lastFitSignature.current = fitSignature
    void setViewport(initialViewport, { duration: 0 }).then(() => {
      setInitialViewportApplied(true)
    })
  }, [fitSignature, flowReady, initialViewport, nodes.length, setViewport])

  const settleRenderedNodes = useCallback((duration: number) => {
    const root = flowRootRef.current
    const flowBounds = root?.querySelector('.react-flow')?.getBoundingClientRect()
    const nodeBounds = Array.from(root?.querySelectorAll('.react-flow__node') ?? []).map((node) => node.getBoundingClientRect())
    if (!flowBounds || nodeBounds.length === 0) return

    const left = Math.min(...nodeBounds.map((bounds) => bounds.left))
    const right = Math.max(...nodeBounds.map((bounds) => bounds.right))
    const top = Math.min(...nodeBounds.map((bounds) => bounds.top))
    const bottom = Math.max(...nodeBounds.map((bounds) => bounds.bottom))
    const deltaX = (left + right) / 2 - (flowBounds.left + flowBounds.right) / 2
    const deltaY = (top + bottom) / 2 - (flowBounds.top + flowBounds.bottom) / 2

    const viewport = getViewport()
    const nextZoom = Math.max(viewport.zoom, fitMinZoom)
    if (Math.abs(nextZoom - viewport.zoom) > 0.005) {
      const renderedCenterX = (left + right) / 2 - flowBounds.left
      const renderedCenterY = (top + bottom) / 2 - flowBounds.top
      const graphCenterX = (renderedCenterX - viewport.x) / viewport.zoom
      const graphCenterY = (renderedCenterY - viewport.y) / viewport.zoom
      setViewport(
        {
          x: flowBounds.width / 2 - graphCenterX * nextZoom,
          y: flowBounds.height / 2 - graphCenterY * nextZoom,
          zoom: nextZoom,
        },
        { duration: Math.min(duration, 560) },
      )
      return
    }

    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return
    setViewport(
      {
        ...viewport,
        x: viewport.x - deltaX,
        y: viewport.y - deltaY,
      },
      { duration: Math.min(duration, 560) },
    )
  }, [fitMinZoom, getViewport, setViewport])

  const fitCanvas = useCallback((duration: number) => {
    if (fitFrame.current) cancelAnimationFrame(fitFrame.current)
    if (fitTimer.current) clearTimeout(fitTimer.current)
    fitTimer.current = setTimeout(() => {
      fitTimer.current = null
      fitFrame.current = requestAnimationFrame(() => {
        fitFrame.current = null
        const root = flowRootRef.current
        const flowBounds = root?.querySelector('.react-flow')?.getBoundingClientRect()
        const graphBounds = getEstimatedNodesBounds(nodes)
        if (!flowBounds || !graphBounds) return

        void setViewport(
          getCenteredViewport(graphBounds, flowBounds.width, flowBounds.height, fitMinZoom, fitMaxZoom, fitPadding),
          { duration },
        ).then(() => {
          requestAnimationFrame(() => settleRenderedNodes(duration))
        })
      })
    }, 50)
  }, [fitMaxZoom, fitMinZoom, fitPadding, nodes, setViewport, settleRenderedNodes])

  useEffect(() => {
    if (!flowReady || nodes.length === 0 || !fitSignature) return

    if (lastFitSignature.current === fitSignature) return

    const isInitialFit = lastFitSignature.current === null
    if (isInitialFit && initialViewport) return
    if (isInitialFit && !initialViewport) return

    lastFitSignature.current = fitSignature
    fitCanvas(isInitialFit ? 480 : 560)
  }, [fitSignature, flowReady, fitCanvas, initialViewport, nodes.length])

  const isWaitingForInitialViewport = nodes.length > 0 && initialViewport && !initialViewportApplied && lastFitSignature.current === null
  return (
    <div ref={flowRootRef} className="h-full w-full" style={{ opacity: isWaitingForInitialViewport ? 0 : 1 }}>
      <ReactFlow
        nodes={animatedNodes}
        edges={animatedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onInit={() => setFlowReady(true)}
        defaultViewport={initialViewport}
        minZoom={0.2}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={interactive}
        panOnDrag={interactive}
        zoomOnScroll={interactive}
        zoomOnPinch={interactive}
        zoomOnDoubleClick={interactive}
        nodesConnectable={false}
        elementsSelectable={interactive}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="var(--ds-neutral-200)" />
        {children}
      </ReactFlow>
    </div>
  )
}

export function RunCanvas({
  nodes,
  edges,
  onNodeClick,
  fitPadding = 0.2,
  fitMaxZoom = DEFAULT_FIT_MAX_ZOOM,
  fitMinZoom = 0,
  showZoomBar = true,
  interactive = true,
  children,
}: {
  nodes: Node[]
  edges: Edge[]
  onNodeClick?: NodeMouseHandler
  fitPadding?: number
  fitMaxZoom?: number
  fitMinZoom?: number
  showZoomBar?: boolean
  interactive?: boolean
  children?: ReactNode
}) {
  const [rootRef, rootSize] = useElementSize<HTMLDivElement>()
  const initialViewport = useMemo(() => {
    if (nodes.length === 0 || rootSize.width === 0 || rootSize.height === 0) return undefined

    const bounds = getEstimatedNodesBounds(nodes)
    if (!bounds) return undefined

    return getCenteredViewport(bounds, rootSize.width, rootSize.height, fitMinZoom, fitMaxZoom, fitPadding)
  }, [fitMaxZoom, fitMinZoom, fitPadding, nodes, rootSize.height, rootSize.width])

  return (
    <ReactFlowProvider>
      <div ref={rootRef} className="relative h-full w-full">
        {showZoomBar && <ZoomBar />}
        <FlowInner
          nodes={nodes}
          edges={edges}
          onNodeClick={onNodeClick}
          fitPadding={fitPadding}
          fitMaxZoom={fitMaxZoom}
          fitMinZoom={fitMinZoom}
          initialViewport={initialViewport}
          interactive={interactive}
        >
          {children}
        </FlowInner>
      </div>
    </ReactFlowProvider>
  )
}
