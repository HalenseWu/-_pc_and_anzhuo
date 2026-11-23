import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

type BackHandler = () => boolean

const stack: BackHandler[] = []

export function pushBackHandler(handler: BackHandler): () => void {
  stack.push(handler)
  return () => {
    const index = stack.lastIndexOf(handler)
    if (index >= 0) stack.splice(index, 1)
  }
}

/** 只接管安卓返回键；浏览器里什么都不做 */
export function initBackButton(): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined
  let remove: (() => void) | undefined
  void App.addListener('backButton', () => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (stack[index]()) return
    }
  }).then((handle) => {
    remove = () => void handle.remove()
  })
  return () => remove?.()
}

export function exitApp(): void {
  void App.exitApp()
}

export function minimizeApp(): void {
  void App.minimizeApp()
}
