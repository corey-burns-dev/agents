/// <reference types="vite/client" />

import type { NativeApi, DesktopBridge } from "@agents/contracts";

declare global {
	interface Window {
		nativeApi?: NativeApi;
		desktopBridge?: DesktopBridge;
	}
}
