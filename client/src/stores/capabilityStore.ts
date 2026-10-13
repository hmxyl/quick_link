import { create } from "zustand";
import axios from "axios";

// 服务端能力探测。
// 以 Windows 服务运行时进程处于 session 0, spawn 出来的 Typora / 资源管理器窗口无法出现在
// 用户桌面上, 服务端会在 /api/health 中把 launchNativeGui 报为 false, 前端据此隐藏相关入口。
// 开发时直接 npm run dev 启动的服务端在用户会话内, 该能力为 true, 入口照常显示。

interface CapabilityState {
  launchNativeGui: boolean;
  load: () => Promise<void>;
}

export const useCapabilityStore = create<CapabilityState>((set) => ({
  // 默认 false: 探测返回前不渲染可能无效的入口, 避免菜单先出现再消失
  launchNativeGui: false,
  load: async () => {
    try {
      const { data } = await axios.get("/api/health");
      set({ launchNativeGui: !!data?.capabilities?.launchNativeGui });
    } catch {
      // 探测失败保持默认值, 不影响其余功能
    }
  },
}));
