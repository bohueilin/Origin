import { HugeiconsIcon } from '@hugeicons/react'
import Activity01Icon from '@hugeicons/core-free-icons/Activity01Icon'
import ArrowLeft01Icon from '@hugeicons/core-free-icons/ArrowLeft01Icon'
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon'
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon'
import BanIcon from '@hugeicons/core-free-icons/BanIcon'
import Camera01Icon from '@hugeicons/core-free-icons/Camera01Icon'
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon'
import CheckIcon from '@hugeicons/core-free-icons/CheckIcon'
import CheckmarkCircle01Icon from '@hugeicons/core-free-icons/CheckmarkCircle01Icon'
import ChevronDownIcon from '@hugeicons/core-free-icons/ChevronDownIcon'
import ChevronRightIcon from '@hugeicons/core-free-icons/ChevronRightIcon'
import CircleIcon from '@hugeicons/core-free-icons/CircleIcon'
import CircleSlash2Icon from '@hugeicons/core-free-icons/CircleSlash2Icon'
import Clock01Icon from '@hugeicons/core-free-icons/Clock01Icon'
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon'
import Database01Icon from '@hugeicons/core-free-icons/Database01Icon'
import Download01Icon from '@hugeicons/core-free-icons/Download01Icon'
import EyeIcon from '@hugeicons/core-free-icons/EyeIcon'
import File01Icon from '@hugeicons/core-free-icons/File01Icon'
import FileCheckIcon from '@hugeicons/core-free-icons/FileCheckIcon'
import FileCodeIcon from '@hugeicons/core-free-icons/FileCodeIcon'
import FileDiffIcon from '@hugeicons/core-free-icons/FileDiffIcon'
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon'
import FolderOpenIcon from '@hugeicons/core-free-icons/FolderOpenIcon'
import GitBranchIcon from '@hugeicons/core-free-icons/GitBranchIcon'
import GitForkIcon from '@hugeicons/core-free-icons/GitForkIcon'
import GroupLayersIcon from '@hugeicons/core-free-icons/GroupLayersIcon'
import HashIcon from '@hugeicons/core-free-icons/HashIcon'
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon'
import Loading03Icon from '@hugeicons/core-free-icons/Loading03Icon'
import LockKeyIcon from '@hugeicons/core-free-icons/LockKeyIcon'
import Maximize02Icon from '@hugeicons/core-free-icons/Maximize02Icon'
import MinusSignIcon from '@hugeicons/core-free-icons/MinusSignIcon'
import MoreHorizontalIcon from '@hugeicons/core-free-icons/MoreHorizontalIcon'
import PlayIcon from '@hugeicons/core-free-icons/PlayIcon'
import PlusSignIcon from '@hugeicons/core-free-icons/PlusSignIcon'
import RefreshCwOffIcon from '@hugeicons/core-free-icons/RefreshCwOffIcon'
import RefreshIcon from '@hugeicons/core-free-icons/RefreshIcon'
import RotateLeft01Icon from '@hugeicons/core-free-icons/RotateLeft01Icon'
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon'
import Share03Icon from '@hugeicons/core-free-icons/Share03Icon'
import Shield01Icon from '@hugeicons/core-free-icons/Shield01Icon'
import ShieldBanIcon from '@hugeicons/core-free-icons/ShieldBanIcon'
import ShieldEnergyIcon from '@hugeicons/core-free-icons/ShieldEnergyIcon'
import ShuffleIcon from '@hugeicons/core-free-icons/ShuffleIcon'
import SparklesIcon from '@hugeicons/core-free-icons/SparklesIcon'
import TriangleIcon from '@hugeicons/core-free-icons/TriangleIcon'
import Tree02Icon from '@hugeicons/core-free-icons/Tree02Icon'
import VerticalResizeIcon from '@hugeicons/core-free-icons/VerticalResizeIcon'
import type { ComponentProps, ComponentType, SVGProps } from 'react'

type HugeiconSource = ComponentProps<typeof HugeiconsIcon>['icon']

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: string | number
  strokeWidth?: number
  absoluteStrokeWidth?: boolean
}

function icon(source: HugeiconSource): ComponentType<IconProps> {
  return function HugeiconAdapter({ size = 24, strokeWidth = 1.5, color = 'currentColor', ...props }: IconProps) {
    return <HugeiconsIcon icon={source} size={size} strokeWidth={strokeWidth} color={color} {...props} />
  }
}

export const Activity = icon(Activity01Icon)
export const AlertTriangle = icon(TriangleIcon)
export const ArrowLeft = icon(ArrowLeft01Icon)
export const ArrowRight = icon(ArrowRight01Icon)
export const ArrowUpRight = icon(ArrowUpRight01Icon)
export const Ban = icon(BanIcon)
export const Camera = icon(Camera01Icon)
export const Check = icon(CheckIcon)
export const CheckCircle2 = icon(CheckmarkCircle01Icon)
export const ChevronDown = icon(ChevronDownIcon)
export const ChevronRight = icon(ChevronRightIcon)
export const Circle = icon(CircleIcon)
export const CircleSlash = icon(CircleSlash2Icon)
export const Clock = icon(Clock01Icon)
export const Copy = icon(Copy01Icon)
export const Database = icon(Database01Icon)
export const Download = icon(Download01Icon)
export const ExternalLink = icon(ArrowUpRight01Icon)
export const Eye = icon(EyeIcon)
export const FileCheck2 = icon(FileCheckIcon)
export const FileCode2 = icon(FileCodeIcon)
export const FileDiff = icon(FileDiffIcon)
export const FileText = icon(File01Icon)
export const Flag = icon(ShieldEnergyIcon)
export const FolderClosed = icon(Folder01Icon)
export const FolderOpen = icon(FolderOpenIcon)
export const GitBranch = icon(GitBranchIcon)
export const GitFork = icon(GitForkIcon)
export const GripVertical = icon(VerticalResizeIcon)
export const Hash = icon(HashIcon)
export const Home = icon(Home01Icon)
export const Layers = icon(GroupLayersIcon)
export const Loader2 = icon(Loading03Icon)
export const Lock = icon(LockKeyIcon)
export const Maximize2 = icon(Maximize02Icon)
export const Minus = icon(MinusSignIcon)
export const MoreHorizontal = icon(MoreHorizontalIcon)
export const Play = icon(PlayIcon)
export const Plus = icon(PlusSignIcon)
export const PlusCircle = icon(PlusSignIcon)
export const RefreshCw = icon(RefreshIcon)
export const RotateCcw = icon(RotateLeft01Icon)
export const RotateCw = icon(RefreshCwOffIcon)
export const Settings = icon(Settings02Icon)
export const Share2 = icon(Share03Icon)
export const ShieldAlert = icon(ShieldEnergyIcon)
export const ShieldCheck = icon(Shield01Icon)
export const ShieldX = icon(ShieldBanIcon)
export const Shuffle = icon(ShuffleIcon)
export const Sparkles = icon(SparklesIcon)
export const Tree02 = icon(Tree02Icon)
export const X = icon(Cancel01Icon)
