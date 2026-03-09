import type { ProviderKind } from "@agents/contracts";
import { getModelOptions, normalizeModelSlug } from "@agents/shared/model";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ZapIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { SidebarInset } from "~/components/ui/sidebar";
import {
	APP_SERVICE_TIER_OPTIONS,
	getCustomModelsForProvider,
	MAX_CUSTOM_MODEL_LENGTH,
	patchCustomModelsForProvider,
	shouldShowFastTierIcon,
	useAppSettings,
} from "../appSettings";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { isDesktopShell } from "../env";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import { ensureNativeApi } from "../nativeApi";
import { preferredTerminalEditor } from "../terminal-links";
import {
	DARK_THEME_PRESETS,
	DENSITY_OPTIONS,
	LIGHT_THEME_PRESET,
	RADIUS_PRESETS,
	resolveUISettingsTheme,
	THEME_MODE_OPTIONS,
	type ThemeMode,
	useUISettings,
} from "../uiSettings";

const MODEL_PROVIDER_SETTINGS: Array<{
	provider: ProviderKind;
	title: string;
	description: string;
	placeholder: string;
	example: string;
}> = [
	{
		provider: "codex",
		title: "Codex",
		description:
			"Save additional Codex model slugs for the picker and `/model` command.",
		placeholder: "your-codex-model-slug",
		example: "gpt-6.7-codex-ultra-preview",
	},
	{
		provider: "gemini",
		title: "Gemini",
		description:
			"Save additional Gemini model slugs for the picker and `/model` command.",
		placeholder: "your-gemini-model-slug",
		example: "gemini-2.5-pro-preview",
	},
	{
		provider: "claude-code",
		title: "Claude Code",
		description:
			"Save additional Claude model slugs for the picker and `/model` command.",
		placeholder: "your-claude-model-slug",
		example: "claude-sonnet-4-6-extended",
	},
] as const;

const THEME_SWATCH_META: Record<
	(typeof DARK_THEME_PRESETS)[number] | typeof LIGHT_THEME_PRESET,
	{ bg: string; card: string; primary: string; label: string }
> = {
	"default-dark": {
		bg: "#0d0d0f",
		card: "#131315",
		primary: "#7c6af7",
		label: "Dark",
	},
	midnight: {
		bg: "#05050a",
		card: "#0a0a14",
		primary: "#8b7ef8",
		label: "Midnight",
	},
	nord: { bg: "#2e3440", card: "#3b4252", primary: "#88c0d0", label: "Nord" },
	"catppuccin-mocha": {
		bg: "#1e1e2e",
		card: "#313244",
		primary: "#cba6f7",
		label: "Mocha",
	},
	"default-light": {
		bg: "#ffffff",
		card: "#f0f0f2",
		primary: "#6356e5",
		label: "Light",
	},
};

const THEME_MODE_LABELS: Record<ThemeMode, string> = {
	system: "System",
	light: "Light",
	dark: "Dark",
};

const RADIUS_PREVIEW_PX: Record<(typeof RADIUS_PRESETS)[number], number> = {
	sharp: 0,
	default: 6,
	rounded: 10,
	pill: 18,
};

const DENSITY_LABELS: Record<(typeof DENSITY_OPTIONS)[number], string> = {
	compact: "Compact",
	comfortable: "Comfortable",
	spacious: "Spacious",
};

function SettingsRouteView() {
	const { settings: uiSettings, updateUISettings } = useUISettings();
	const { resolvedTheme } = resolveUISettingsTheme(uiSettings);
	const { settings, defaults, updateSettings } = useAppSettings();
	const serverConfigQuery = useQuery(serverConfigQueryOptions());
	const [isOpeningKeybindings, setIsOpeningKeybindings] = useState(false);
	const [openKeybindingsError, setOpenKeybindingsError] = useState<
		string | null
	>(null);
	const [customModelInputByProvider, setCustomModelInputByProvider] = useState<
		Record<ProviderKind, string>
	>({
		codex: "",
		gemini: "",
		"claude-code": "",
	});
	const [customModelErrorByProvider, setCustomModelErrorByProvider] = useState<
		Partial<Record<ProviderKind, string | null>>
	>({});

	const codexBinaryPath = settings.codexBinaryPath;
	const codexHomePath = settings.codexHomePath;
	const geminiBinaryPath = settings.geminiBinaryPath;
	const geminiHomePath = settings.geminiHomePath;
	const claudeCodeBinaryPath = settings.claudeCodeBinaryPath;
	const claudeCodeHomePath = settings.claudeCodeHomePath;
	const codexServiceTier = settings.codexServiceTier;
	const keybindingsConfigPath =
		serverConfigQuery.data?.keybindingsConfigPath ?? null;

	const openKeybindingsFile = useCallback(() => {
		if (!keybindingsConfigPath) return;
		setOpenKeybindingsError(null);
		setIsOpeningKeybindings(true);
		const api = ensureNativeApi();
		void api.shell
			.openInEditor(keybindingsConfigPath, preferredTerminalEditor())
			.catch((error) => {
				setOpenKeybindingsError(
					error instanceof Error
						? error.message
						: "Unable to open keybindings file.",
				);
			})
			.finally(() => {
				setIsOpeningKeybindings(false);
			});
	}, [keybindingsConfigPath]);

	const addCustomModel = useCallback(
		(provider: ProviderKind) => {
			const customModelInput = customModelInputByProvider[provider];
			const customModels = getCustomModelsForProvider(settings, provider);
			const normalized = normalizeModelSlug(customModelInput, provider);
			if (!normalized) {
				setCustomModelErrorByProvider((existing) => ({
					...existing,
					[provider]: "Enter a model slug.",
				}));
				return;
			}
			if (
				getModelOptions(provider).some((option) => option.slug === normalized)
			) {
				setCustomModelErrorByProvider((existing) => ({
					...existing,
					[provider]: "That model is already built in.",
				}));
				return;
			}
			if (normalized.length > MAX_CUSTOM_MODEL_LENGTH) {
				setCustomModelErrorByProvider((existing) => ({
					...existing,
					[provider]: `Model slugs must be ${MAX_CUSTOM_MODEL_LENGTH} characters or less.`,
				}));
				return;
			}
			if (customModels.includes(normalized)) {
				setCustomModelErrorByProvider((existing) => ({
					...existing,
					[provider]: "That custom model is already saved.",
				}));
				return;
			}

			updateSettings(
				patchCustomModelsForProvider(provider, [...customModels, normalized]),
			);
			setCustomModelInputByProvider((existing) => ({
				...existing,
				[provider]: "",
			}));
			setCustomModelErrorByProvider((existing) => ({
				...existing,
				[provider]: null,
			}));
		},
		[customModelInputByProvider, settings, updateSettings],
	);

	const removeCustomModel = useCallback(
		(provider: ProviderKind, slug: string) => {
			const customModels = getCustomModelsForProvider(settings, provider);
			updateSettings(
				patchCustomModelsForProvider(
					provider,
					customModels.filter((model) => model !== slug),
				),
			);
			setCustomModelErrorByProvider((existing) => ({
				...existing,
				[provider]: null,
			}));
		},
		[settings, updateSettings],
	);

	return (
		<SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
			<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
				{isDesktopShell && (
					<div className="drag-region flex h-13 shrink-0 items-center border-b border-border px-5">
						<span className="text-xs font-medium tracking-wide text-muted-foreground/70">
							Settings
						</span>
					</div>
				)}

				<div className="flex-1 overflow-y-auto p-6">
					<div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
						<header className="space-y-1">
							<h1 className="text-2xl font-semibold tracking-tight text-foreground">
								Settings
							</h1>
							<p className="text-sm text-muted-foreground">
								Configure app-level preferences for this device.
							</p>
						</header>

						<section className="settings-density-card rounded-2xl border border-border bg-card p-5">
							<div className="mb-5">
								<h2 className="text-sm font-medium text-foreground">
									Appearance
								</h2>
								<p className="mt-1 text-xs text-muted-foreground">
									Customize colors, typography, spacing, and effects.
								</p>
							</div>

							<div className="mb-5">
								<p className="mb-2.5 text-xs font-medium text-foreground">
									Theme Mode
								</p>
								<div
									className="chrome-density-toolbar flex flex-wrap gap-1.5"
									role="radiogroup"
									aria-label="Theme mode"
								>
									{THEME_MODE_OPTIONS.map((mode) => (
										<button
											key={mode}
											type="button"
											role="radio"
											aria-checked={uiSettings.themeMode === mode}
											onClick={() => updateUISettings({ themeMode: mode })}
											className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
												uiSettings.themeMode === mode
													? "bg-primary text-primary-foreground"
													: "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
											}`}
										>
											{THEME_MODE_LABELS[mode]}
										</button>
									))}
								</div>
								<p className="mt-2 text-xs text-muted-foreground">
									{uiSettings.themeMode === "system"
										? `Following your OS appearance. Currently ${resolvedTheme}.`
										: uiSettings.themeMode === "light"
											? "Uses the light palette."
											: "Uses the selected dark palette."}
								</p>
							</div>

							<div className="mb-5">
								<p className="mb-2.5 text-xs font-medium text-foreground">
									Palette
								</p>
								<div
									className="flex flex-wrap gap-2.5"
									role="radiogroup"
									aria-label="Theme palette"
								>
									{(uiSettings.themeMode === "light"
										? [LIGHT_THEME_PRESET]
										: DARK_THEME_PRESETS
									).map((preset) => {
										const meta = THEME_SWATCH_META[preset];
										const selected =
											preset === LIGHT_THEME_PRESET
												? resolvedTheme === "light"
												: uiSettings.themePreset === preset;
										const isLight = preset === "default-light";
										return (
											<button
												key={preset}
												type="button"
												role="radio"
												aria-checked={selected}
												title={meta.label}
												onClick={() => {
													if (preset !== LIGHT_THEME_PRESET) {
														updateUISettings({ themePreset: preset });
													}
												}}
												className={`group flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-primary/40"}`}
												disabled={preset === LIGHT_THEME_PRESET}
											>
												<div
													className="relative h-12 w-16 overflow-hidden rounded"
													style={{ background: meta.bg }}
												>
													<div
														className="absolute bottom-0 left-0 right-0 h-6 rounded-t"
														style={{ background: meta.card }}
													/>
													<div
														className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full"
														style={{ background: meta.primary }}
													/>
													<div
														className="absolute left-1.5 top-2 h-1 w-6 rounded-full opacity-40"
														style={{ background: isLight ? "#333" : "#fff" }}
													/>
													<div
														className="absolute left-1.5 top-4 h-1 w-4 rounded-full opacity-25"
														style={{ background: isLight ? "#333" : "#fff" }}
													/>
												</div>
												<span
													className={`text-[10px] font-medium ${selected ? "text-primary" : "text-muted-foreground"}`}
												>
													{meta.label}
												</span>
											</button>
										);
									})}
								</div>
							</div>

							{/* Font size */}
							<div className="mb-5">
								<div className="mb-2 flex items-center justify-between">
									<p className="text-xs font-medium text-foreground">
										Font Size
									</p>
									<span className="text-xs tabular-nums text-muted-foreground">
										{uiSettings.fontSize}%
									</span>
								</div>
								<div className="flex items-center gap-2.5">
									<span className="text-xs text-muted-foreground">A</span>
									<input
										type="range"
										min={75}
										max={125}
										step={5}
										value={uiSettings.fontSize}
										onChange={(e) =>
											updateUISettings({ fontSize: Number(e.target.value) })
										}
										className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
										aria-label="Font size"
									/>
									<span className="text-base text-muted-foreground">A</span>
								</div>
							</div>

							{/* Density */}
							<div className="mb-5">
								<p className="mb-2 text-xs font-medium text-foreground">
									Density
								</p>
								<p className="mb-2 text-xs text-muted-foreground">
									Adjusts spacing in the app chrome without changing message
									content layout.
								</p>
								<div
									className="chrome-density-toolbar flex gap-1.5"
									role="radiogroup"
									aria-label="UI density"
								>
									{DENSITY_OPTIONS.map((d) => (
										<button
											key={d}
											type="button"
											role="radio"
											aria-checked={uiSettings.density === d}
											onClick={() => updateUISettings({ density: d })}
											className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${uiSettings.density === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"}`}
										>
											{DENSITY_LABELS[d]}
										</button>
									))}
								</div>
							</div>

							{/* Border radius */}
							<div className="mb-5">
								<p className="mb-2 text-xs font-medium text-foreground">
									Corner Radius
								</p>
								<div
									className="flex gap-2"
									role="radiogroup"
									aria-label="Corner radius"
								>
									{RADIUS_PRESETS.map((r) => {
										const selected = uiSettings.radiusPreset === r;
										const px = RADIUS_PREVIEW_PX[r];
										const label =
											r === "sharp"
												? "Sharp"
												: r === "default"
													? "Default"
													: r === "rounded"
														? "Rounded"
														: "Pill";
										return (
											<button
												key={r}
												type="button"
												role="radio"
												aria-checked={selected}
												title={label}
												onClick={() => updateUISettings({ radiusPreset: r })}
												className={`flex flex-col items-center gap-1.5 rounded-lg p-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-primary/40"}`}
											>
												<div
													className={`h-7 w-9 border-2 transition-all ${selected ? "border-primary" : "border-muted-foreground/40"}`}
													style={{ borderRadius: `${px}px` }}
												/>
												<span
													className={`text-[10px] font-medium ${selected ? "text-primary" : "text-muted-foreground"}`}
												>
													{label}
												</span>
											</button>
										);
									})}
								</div>
							</div>

							{/* Glass effect */}
							<div className="flex items-center justify-between">
								<div>
									<p className="text-xs font-medium text-foreground">
										Glass effect
									</p>
									<p className="text-xs text-muted-foreground">
										Adds blur and transparency to panels.
									</p>
								</div>
								<Switch
									checked={uiSettings.glassEffect}
									onCheckedChange={(checked) =>
										updateUISettings({ glassEffect: checked })
									}
									aria-label="Toggle glass effect"
								/>
							</div>
						</section>

						<section className="settings-density-card rounded-2xl border border-border bg-card p-5">
							<div className="mb-4">
								<h2 className="text-sm font-medium text-foreground">
									Codex App Server
								</h2>
								<p className="mt-1 text-xs text-muted-foreground">
									These overrides apply to new sessions and let you use a
									non-default Codex install.
								</p>
							</div>

							<div className="space-y-4">
								<label htmlFor="codex-binary-path" className="block space-y-1">
									<span className="text-xs font-medium text-foreground">
										Codex binary path
									</span>
									<Input
										id="codex-binary-path"
										value={codexBinaryPath}
										onChange={(event) =>
											updateSettings({ codexBinaryPath: event.target.value })
										}
										placeholder="codex"
										spellCheck={false}
									/>
									<span className="text-xs text-muted-foreground">
										Leave blank to use <code>codex</code> from your PATH.
									</span>
								</label>

								<label htmlFor="codex-home-path" className="block space-y-1">
									<span className="text-xs font-medium text-foreground">
										CODEX_HOME path
									</span>
									<Input
										id="codex-home-path"
										value={codexHomePath}
										onChange={(event) =>
											updateSettings({ codexHomePath: event.target.value })
										}
										placeholder="/Users/you/.codex"
										spellCheck={false}
									/>
									<span className="text-xs text-muted-foreground">
										Optional custom Codex home/config directory.
									</span>
								</label>

								<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
									<p>
										Binary source:{" "}
										<span className="font-medium text-foreground">
											{codexBinaryPath || "PATH"}
										</span>
									</p>
									<Button
										size="xs"
										variant="outline"
										onClick={() =>
											updateSettings({
												codexBinaryPath: defaults.codexBinaryPath,
												codexHomePath: defaults.codexHomePath,
											})
										}
									>
										Reset codex overrides
									</Button>
								</div>
							</div>
						</section>

						<section className="settings-density-card rounded-2xl border border-border bg-card p-5">
							<div className="mb-4">
								<h2 className="text-sm font-medium text-foreground">
									Gemini App Server
								</h2>
								<p className="mt-1 text-xs text-muted-foreground">
									These overrides apply to new sessions and let you use a
									non-default Gemini install.
								</p>
							</div>

							<div className="space-y-4">
								<label htmlFor="gemini-binary-path" className="block space-y-1">
									<span className="text-xs font-medium text-foreground">
										Gemini binary path
									</span>
									<Input
										id="gemini-binary-path"
										value={geminiBinaryPath}
										onChange={(event) =>
											updateSettings({ geminiBinaryPath: event.target.value })
										}
										placeholder="gemini"
										spellCheck={false}
									/>
									<span className="text-xs text-muted-foreground">
										Leave blank to use <code>gemini</code> from your PATH.
									</span>
								</label>

								<label htmlFor="gemini-home-path" className="block space-y-1">
									<span className="text-xs font-medium text-foreground">
										GEMINI_HOME path
									</span>
									<Input
										id="gemini-home-path"
										value={geminiHomePath}
										onChange={(event) =>
											updateSettings({ geminiHomePath: event.target.value })
										}
										placeholder="/Users/you/.gemini"
										spellCheck={false}
									/>
									<span className="text-xs text-muted-foreground">
										Optional custom Gemini home/config directory.
									</span>
								</label>

								<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
									<p>
										Binary source:{" "}
										<span className="font-medium text-foreground">
											{geminiBinaryPath || "PATH"}
										</span>
									</p>
									<Button
										size="xs"
										variant="outline"
										onClick={() =>
											updateSettings({
												geminiBinaryPath: defaults.geminiBinaryPath,
												geminiHomePath: defaults.geminiHomePath,
											})
										}
									>
										Reset gemini overrides
									</Button>
								</div>
							</div>
						</section>

						<section className="settings-density-card rounded-2xl border border-border bg-card p-5">
							<div className="mb-4">
								<h2 className="text-sm font-medium text-foreground">
									Claude Code
								</h2>
								<p className="mt-1 text-xs text-muted-foreground">
									These overrides apply to new Claude sessions and let you use a
									non-default Claude install or config directory.
								</p>
							</div>

							<div className="space-y-4">
								<label
									htmlFor="claude-code-binary-path"
									className="block space-y-1"
								>
									<span className="text-xs font-medium text-foreground">
										Claude binary path
									</span>
									<Input
										id="claude-code-binary-path"
										value={claudeCodeBinaryPath}
										onChange={(event) =>
											updateSettings({
												claudeCodeBinaryPath: event.target.value,
											})
										}
										placeholder="claude"
										spellCheck={false}
									/>
									<span className="text-xs text-muted-foreground">
										Leave blank to use <code>claude</code> from your PATH.
									</span>
								</label>

								<label
									htmlFor="claude-code-home-path"
									className="block space-y-1"
								>
									<span className="text-xs font-medium text-foreground">
										CLAUDE_CONFIG_DIR path
									</span>
									<Input
										id="claude-code-home-path"
										value={claudeCodeHomePath}
										onChange={(event) =>
											updateSettings({
												claudeCodeHomePath: event.target.value,
											})
										}
										placeholder="/Users/you/.claude"
										spellCheck={false}
									/>
									<span className="text-xs text-muted-foreground">
										Optional custom Claude config directory.
									</span>
								</label>

								<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
									<p>
										Binary source:{" "}
										<span className="font-medium text-foreground">
											{claudeCodeBinaryPath || "PATH"}
										</span>
									</p>
									<Button
										size="xs"
										variant="outline"
										onClick={() =>
											updateSettings({
												claudeCodeBinaryPath: defaults.claudeCodeBinaryPath,
												claudeCodeHomePath: defaults.claudeCodeHomePath,
											})
										}
									>
										Reset Claude overrides
									</Button>
								</div>
							</div>
						</section>

						<section className="settings-density-card rounded-2xl border border-border bg-card p-5">
							<div className="mb-4">
								<h2 className="text-sm font-medium text-foreground">Models</h2>
								<p className="mt-1 text-xs text-muted-foreground">
									Save additional provider model slugs so they appear in the
									chat model picker and `/model` command suggestions.
								</p>
							</div>

							<div className="space-y-5">
								<fieldset
									aria-labelledby="settings-default-service-tier-label"
									className="block space-y-1 border-0 p-0 m-0 min-w-0 min-h-0"
								>
									<span
										id="settings-default-service-tier-label"
										className="text-xs font-medium text-foreground"
									>
										Default service tier
									</span>
									<Select
										items={APP_SERVICE_TIER_OPTIONS.map((option) => ({
											label: option.label,
											value: option.value,
										}))}
										value={codexServiceTier}
										onValueChange={(value) => {
											if (!value) return;
											updateSettings({ codexServiceTier: value });
										}}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectPopup alignItemWithTrigger={false}>
											{APP_SERVICE_TIER_OPTIONS.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													<div className="flex min-w-0 items-center gap-2">
														{option.value === "fast" ? (
															<ZapIcon className="size-3.5 text-amber-500" />
														) : (
															<span
																className="size-3.5 shrink-0"
																aria-hidden="true"
															/>
														)}
														<span className="truncate">{option.label}</span>
													</div>
												</SelectItem>
											))}
										</SelectPopup>
									</Select>
									<span className="text-xs text-muted-foreground">
										{APP_SERVICE_TIER_OPTIONS.find(
											(option) => option.value === codexServiceTier,
										)?.description ??
											"Use Codex defaults without forcing a service tier."}
									</span>
								</fieldset>

								{MODEL_PROVIDER_SETTINGS.map((providerSettings) => {
									const provider = providerSettings.provider;
									const customModels = getCustomModelsForProvider(
										settings,
										provider,
									);
									const customModelInput = customModelInputByProvider[provider];
									const customModelError =
										customModelErrorByProvider[provider] ?? null;
									return (
										<div
											key={provider}
											className="rounded-xl border border-border bg-background/50 p-4"
										>
											<div className="mb-4">
												<h3 className="text-sm font-medium text-foreground">
													{providerSettings.title}
												</h3>
												<p className="mt-1 text-xs text-muted-foreground">
													{providerSettings.description}
												</p>
											</div>

											<div className="space-y-4">
												<div className="flex flex-col gap-3 sm:flex-row sm:items-start">
													<label
														htmlFor={`custom-model-slug-${provider}`}
														className="block flex-1 space-y-1"
													>
														<span className="text-xs font-medium text-foreground">
															Custom model slug
														</span>
														<Input
															id={`custom-model-slug-${provider}`}
															value={customModelInput}
															onChange={(event) => {
																const value = event.target.value;
																setCustomModelInputByProvider((existing) => ({
																	...existing,
																	[provider]: value,
																}));
																if (customModelError) {
																	setCustomModelErrorByProvider((existing) => ({
																		...existing,
																		[provider]: null,
																	}));
																}
															}}
															onKeyDown={(event) => {
																if (event.key !== "Enter") return;
																event.preventDefault();
																addCustomModel(provider);
															}}
															placeholder={providerSettings.placeholder}
															spellCheck={false}
														/>
														<span className="text-xs text-muted-foreground">
															Example: <code>{providerSettings.example}</code>
														</span>
													</label>

													<Button
														className="sm:mt-6"
														type="button"
														onClick={() => addCustomModel(provider)}
													>
														Add model
													</Button>
												</div>

												{customModelError ? (
													<p className="text-xs text-destructive">
														{customModelError}
													</p>
												) : null}

												<div className="space-y-2">
													<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
														<p>Saved custom models: {customModels.length}</p>
														{customModels.length > 0 ? (
															<Button
																size="xs"
																variant="outline"
																onClick={() =>
																	updateSettings(
																		patchCustomModelsForProvider(provider, [
																			...getCustomModelsForProvider(
																				defaults,
																				provider,
																			),
																		]),
																	)
																}
															>
																Reset custom models
															</Button>
														) : null}
													</div>

													{customModels.length > 0 ? (
														<div className="space-y-2">
															{customModels.map((slug) => (
																<div
																	key={`${provider}:${slug}`}
																	className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
																>
																	<div className="flex min-w-0 flex-1 items-center gap-2">
																		{provider === "codex" &&
																		shouldShowFastTierIcon(
																			slug,
																			codexServiceTier,
																		) ? (
																			<ZapIcon className="size-3.5 shrink-0 text-amber-500" />
																		) : null}
																		<code className="min-w-0 flex-1 truncate text-xs text-foreground">
																			{slug}
																		</code>
																	</div>
																	<Button
																		size="xs"
																		variant="ghost"
																		onClick={() =>
																			removeCustomModel(provider, slug)
																		}
																	>
																		Remove
																	</Button>
																</div>
															))}
														</div>
													) : (
														<div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
															No custom models saved yet.
														</div>
													)}
												</div>
											</div>
										</div>
									);
								})}
							</div>
						</section>

						<section className="settings-density-card rounded-2xl border border-border bg-card p-5">
							<div className="mb-4">
								<h2 className="text-sm font-medium text-foreground">
									Responses
								</h2>
								<p className="mt-1 text-xs text-muted-foreground">
									Control how assistant output is rendered during a turn.
								</p>
							</div>

							<div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
								<div>
									<p className="text-sm font-medium text-foreground">
										Stream assistant messages
									</p>
									<p className="text-xs text-muted-foreground">
										Show token-by-token output while a response is in progress.
									</p>
								</div>
								<Switch
									checked={settings.enableAssistantStreaming}
									onCheckedChange={(checked) =>
										updateSettings({
											enableAssistantStreaming: Boolean(checked),
										})
									}
									aria-label="Stream assistant messages"
								/>
							</div>

							{settings.enableAssistantStreaming !==
							defaults.enableAssistantStreaming ? (
								<div className="mt-3 flex justify-end">
									<Button
										size="xs"
										variant="outline"
										onClick={() =>
											updateSettings({
												enableAssistantStreaming:
													defaults.enableAssistantStreaming,
											})
										}
									>
										Restore default
									</Button>
								</div>
							) : null}
						</section>

						<section className="settings-density-card rounded-2xl border border-border bg-card p-5">
							<div className="mb-4">
								<h2 className="text-sm font-medium text-foreground">
									Keybindings
								</h2>
								<p className="mt-1 text-xs text-muted-foreground">
									Open the persisted <code>keybindings.json</code> file to edit
									advanced bindings directly.
								</p>
							</div>

							<div className="space-y-3">
								<div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
									<div className="min-w-0 flex-1">
										<p className="text-xs font-medium text-foreground">
											Config file path
										</p>
										<p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
											{keybindingsConfigPath ?? "Resolving keybindings path..."}
										</p>
									</div>
									<Button
										size="xs"
										variant="outline"
										disabled={!keybindingsConfigPath || isOpeningKeybindings}
										onClick={openKeybindingsFile}
									>
										{isOpeningKeybindings
											? "Opening..."
											: "Open keybindings.json"}
									</Button>
								</div>

								<p className="text-xs text-muted-foreground">
									Opens in your preferred editor selection.
								</p>
								{openKeybindingsError ? (
									<p className="text-xs text-destructive">
										{openKeybindingsError}
									</p>
								) : null}
							</div>
						</section>

						<section className="settings-density-card rounded-2xl border border-border bg-card p-5">
							<div className="mb-4">
								<h2 className="text-sm font-medium text-foreground">Safety</h2>
								<p className="mt-1 text-xs text-muted-foreground">
									Additional guardrails for destructive local actions.
								</p>
							</div>

							<div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
								<div>
									<p className="text-sm font-medium text-foreground">
										Confirm thread deletion
									</p>
									<p className="text-xs text-muted-foreground">
										Ask for confirmation before deleting a thread and its chat
										history.
									</p>
								</div>
								<Switch
									checked={settings.confirmThreadDelete}
									onCheckedChange={(checked) =>
										updateSettings({
											confirmThreadDelete: Boolean(checked),
										})
									}
									aria-label="Confirm thread deletion"
								/>
							</div>

							{settings.confirmThreadDelete !== defaults.confirmThreadDelete ? (
								<div className="mt-3 flex justify-end">
									<Button
										size="xs"
										variant="outline"
										onClick={() =>
											updateSettings({
												confirmThreadDelete: defaults.confirmThreadDelete,
											})
										}
									>
										Restore default
									</Button>
								</div>
							) : null}
						</section>
					</div>
				</div>
			</div>
		</SidebarInset>
	);
}

export const Route = createFileRoute("/_chat/settings")({
	component: SettingsRouteView,
});
