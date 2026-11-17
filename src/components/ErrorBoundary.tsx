import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** 渲染失败时显示的替代内容 */
  fallback: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * 3D 场景的兜底边界。
 * three.js / drei 在几何数据异常时会直接抛错，如果不拦截，React 会卸载整棵树，
 * 用户看到的就是一整页黑屏。这里把异常收在场景卡片内部，并给出可读的提示。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('3D 场景渲染失败：', error, info.componentStack)
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    // 输入改变后重新尝试渲染，避免一次偶发错误把场景永久锁死。
    // children 是同一引用时不会触发（例如本组件自身 setState 引起的更新）。
    if (this.state.hasError && previous.children !== this.props.children) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}
