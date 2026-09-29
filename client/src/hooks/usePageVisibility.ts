import { createContext, useContext } from "react";

/**
 * 页面可见性 Context: 由 App 组件提供, 值为当前激活的路由路径
 * 子组件通过 usePageVisibility() 判断自身是否处于可见状态
 * 用于在 CachedPages (CSS display 缓存) 架构下, 让隐藏页面释放重型资源
 */
export const PageVisibilityContext = createContext<string>("/");

/**
 * 判断当前页面是否可见 (路由匹配当前路径)
 * 在 CachedPages 架构下, 页面组件通过 CSS display 切换而非卸载,
 * 该 hook 让子组件感知自身可见性, 按需释放 Milkdown 编辑器等重型资源
 */
export function usePageVisibility(routePath: string): boolean {
  const currentPath = useContext(PageVisibilityContext);
  return currentPath === routePath;
}
