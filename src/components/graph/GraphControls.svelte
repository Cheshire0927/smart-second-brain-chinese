<script lang="ts">
import BottomSheet from "../ui/BottomSheet.svelte";
import Button from "../ui/Button.svelte";
import RangeSlider from "../ui/RangeSlider.svelte";
import Toggle from "../ui/Toggle.svelte";
import SettingContainer from "../settings/SettingContainer.svelte";
import { isMobileUI } from "../../utils/platform";
import {
	type SmartGraphSettings,
	type GraphData,
	type SpaceSegment,
	DEFAULT_SMART_GRAPH_SETTINGS,
} from "../../types/graph";
import { maxGranularityLevel, MIN_GRANULARITY_LEVEL } from "../../utils/topicHierarchy";

/** Slider length before the vault's real ladder has been derived. */
const MAX_GRANULARITY_LEVEL_FALLBACK = maxGranularityLevel();

interface Props {
	settings: SmartGraphSettings;
	isLoading?: boolean;
	loadingLabel?: string;
	onSettingsChange: (patch: Partial<SmartGraphSettings>) => void;
	onFitToView: () => void;
	onRefresh: () => void;
	onReapplySegments?: () => void;
	onSeedChange?: () => void;
	/** Current granularity level, derived from the active Leiden resolution. */
	granularityLevel?: number;
	/** Highest selectable level — varies per vault, see deriveGranularityLadder. */
	granularityMaxLevel?: number;
	/** False until the vault's granularity levels have been established. */
	granularityReady?: boolean;
	/** Apply a level mid-drag (cache hits only). */
	onGranularityChange?: (level: number) => void;
	/** Commit a new granularity level — re-runs topic detection at the matching resolution. */
	onGranularityCommit?: (level: number) => void;
	isLeidenRunning?: boolean;
	/** True while topic names are being generated. */
	isLabeling?: boolean;
	/** Manually (re)generate topic names via the configured graph model. */
	onLabelTopics?: () => void;
	/** Abort an in-flight naming run. */
	onCancelLabeling?: () => void;
	lassoMode?: boolean;
	onLassoModeChange?: (active: boolean) => void;
	graphData?: GraphData;
	/**
	 * False when no graph embedding index is selected (or its config is gone),
	 * so no inferred edge can exist regardless of the toggle's stored value.
	 */
	hasGraphIndex?: boolean;
	nodeCount?: number;
	// Segments (community list)
	segments?: SpaceSegment[];
	focusedSegmentIds?: Set<string>;
	onFocusSegment?: (id: string, multi: boolean) => void;
	/** True when topics are collapsed into single nodes. */
	isTopicsCollapsed?: boolean;
	/** Collapse or expand all topics at once (the atom button / S shortcut). */
	onToggleCollapseAll?: () => void;
	/**
	 * Whether the settings panel is hidden. Bindable so the parent can close it
	 * — on mobile the panel is a bottom sheet, and a selection appearing has to
	 * be able to take the sheet slot over (only one sheet at a time).
	 */
	isCollapsed?: boolean;
	/** True while the graph is rebuilt from a subset of notes. */
	isImmersed?: boolean;
	/** Leave immerse and return to the full graph. */
	onExitImmerse?: () => void;
	/**
	 * Live width of the toolbar row, so siblings sharing the top strip (the
	 * mobile immerse banner) can reserve exactly the space it takes. Measured
	 * rather than assumed: the button count changes with mode (immerse adds an
	 * exit button) and the row wraps on narrow phones.
	 */
	onToolbarWidth?: (width: number) => void;
}

let {
	settings,
	isLoading = false,
	loadingLabel = "",
	onSettingsChange,
	onFitToView,
	onRefresh,
	onReapplySegments,
	onSeedChange,
	granularityLevel = 3,
	granularityMaxLevel = MAX_GRANULARITY_LEVEL_FALLBACK,
	granularityReady = false,
	onGranularityChange,
	onGranularityCommit,
	isLeidenRunning = false,
	isLabeling = false,
	onLabelTopics,
	onCancelLabeling,
	lassoMode = false,
	onLassoModeChange,
	graphData = { nodes: [], edges: [] },
	hasGraphIndex = true,
	nodeCount = 0,
	segments = [],
	focusedSegmentIds = new Set<string>(),
	onFocusSegment,
	isTopicsCollapsed = false,
	onToggleCollapseAll,
	isCollapsed = $bindable(true),
	isImmersed = false,
	onExitImmerse,
	onToolbarWidth,
}: Props = $props();

/** Measured width of the toolbar row; reported up so the immerse banner can
 *  cap itself against it instead of hardcoding a button-count guess. */
let toolbarWidth = $state(0);

$effect(() => {
	onToolbarWidth?.(toolbarWidth);
});

let isDevCollapsed = $state(true);

/** Defaulted here rather than in the template — settings persisted before this
 *  toggle existed have no value for it, and topics-on is the established behaviour. */
let showTopics = $derived(settings.showTopics ?? true);

/**
 * Live height of the main panel, so the dev panel can stack directly beneath
 * it. Measured rather than assumed: the panel grows and shrinks as sections
 * are opened and as the topic list fills.
 */
let mainPanelHeight = $state(0);

let sectionOpen: Record<string, boolean> = $state({
	devLayout: false,
	devSemantic: false,
	devLeiden: false,
	devAppearance: false,
});

let graphStats = $derived.by(() => {
	const { nodes, edges } = graphData;
	if (nodes.length === 0) return null;

	const degrees = nodes.map((n) => n.degree ?? 0);
	const totalDegree = degrees.reduce((a, b) => a + b, 0);
	const avgDegree = totalDegree / nodes.length;
	const maxDegree = Math.max(...degrees);

	// `degree` counts inferred semantic edges too, so it can't answer "how many notes
	// did I never link?" — count authored wiki links directly instead.
	const wikiLinkedPaths = new Set<string>();
	for (const edge of edges) {
		if (edge.type !== "wiki") continue;
		wikiLinkedPaths.add(edge.source);
		wikiLinkedPaths.add(edge.target);
	}
	const unlinkedNotes = nodes.filter((n) => !wikiLinkedPaths.has(n.path)).length;
	const wikiEdges = edges.filter((e) => e.type === "wiki").length;
	const semanticEdges = edges.filter((e) => e.type === "semantic").length;
	const clusters = new Set(nodes.map((n) => n.cluster).filter((c) => c != null));

	return { avgDegree, maxDegree, unlinkedNotes, wikiEdges, semanticEdges, clusterCount: clusters.size };
});

/**
 * Both states report a real number rather than describing the switch, because the
 * interesting question — "how much of my vault does my own linking actually
 * organise?" — is answered by comparing them. Turning inferred links off and
 * watching the coverage drop is the point of the control.
 */
let inferredLinksOn = $derived(!(settings.linkOnlyTopics ?? false) && (settings.showSemanticLinks ?? true));

/**
 * What the control does, plus the live result of its current state.
 *
 * Delivered as one description through the row's normal hover tooltip, exactly
 * like every other compact setting here. An earlier version split these — help
 * behind an info icon, measurement inline under the toggle — which gave this one
 * row two affordances no other row had, and put a paragraph in a column of
 * single-line switches. The measurement is worth reading, but not worth breaking
 * the shape of the panel for; a user who wants the number is already hovering
 * the control they just flipped.
 */
let inferredLinksHint = $derived.by(() => {
	const total = graphData.nodes.length;
	if (!hasGraphIndex) {
		return "除了你写的链接，也按语义把笔记连接起来。需要一个图谱嵌入索引——请在插件的图谱设置中选择一个。";
	}
	if (!inferredLinksOn) {
		// Only report link coverage when topics really are link-only. A stored
		// half-state (hidden but still grouping) would make that number a lie.
		if (!settings.linkOnlyTopics) {
			return "已隐藏，但仍在参与笔记分组。再切换两次可将它们也从主题中排除。";
		}
		if (total === 0) return "已关闭——主题仅来自你写的链接。";
		const placed = graphData.nodes.filter((n) => n.cluster != null).length;
		const percent = Math.round((placed / total) * 100);
		return `已关闭——主题仅来自你写的链接。仅凭你的链接为 ${total} 篇笔记中的 ${placed} 篇分出了主题（${percent}%），其余 ${total - placed} 篇未建立链接。`;
	}
	const inferred = graphData.edges.filter((e) => e.type === "semantic").length;
	if (inferred === 0) {
		return "除了你写的链接，也按语义把笔记连接起来——需要一个图谱嵌入索引。";
	}
	return `除了你写的链接，也按语义把笔记连接起来：当前有 ${inferred} 条相似性连线，让未建立链接的笔记也能归入主题。关闭即可查看你自己的链接覆盖了哪些内容。`;
});

function handleLinkDistanceChange(val: number) {
	onSettingsChange({ linkDistance: val });
}

function handleChargeStrengthChange(val: number) {
	onSettingsChange({ chargeStrength: -Math.abs(val) });
}

function handleCenterStrengthChange(val: number) {
	onSettingsChange({ centerStrength: val / 100 });
}

function handleLinkStrengthChange(val: number) {
	onSettingsChange({ linkStrength: val / 100 });
}

function handleClusterCohesionStrengthChange(val: number) {
	onSettingsChange({ clusterCohesionStrength: val / 100 });
}

/**
 * Set γ directly, bypassing the granularity ladder.
 *
 * The user-facing slider snaps to the vault's derived rungs; this one is
 * deliberately continuous so a dev can probe values between them. Reuses the
 * seed callback because both change the Leiden partition identity, which is
 * exactly what needs recomputing.
 */
function handleResolutionChange(resolution: number) {
	onSettingsChange({ leidenResolution: resolution });
	onSeedChange?.();
}

/**
 * Every knob this panel exposes, so "reset" restores exactly what it can change
 * — and nothing else. Listing the keys explicitly (rather than spreading the
 * whole defaults object) keeps the user's model choice and filters untouched,
 * and makes a newly added control's absence here obvious.
 */
const DEV_TUNABLE_KEYS = [
	"linkDistance",
	"chargeStrength",
	"centerStrength",
	"linkStrength",
	"clusterCohesionStrength",
	"semanticNeighborCount",
	"semanticThreshold",
	"leidenSeed",
	"leidenResolution",
	"bridgeThreshold",
	"linkOnlyTopics",
	"directedWikiEdges",
	"showTopicHulls",
	"showClusterLabels",
	"highlightBridges",
	"highlightIsolated",
	"markdownOnly",
] as const satisfies ReadonlyArray<keyof SmartGraphSettings>;

/**
 * Restore every tuning value in this panel to its shipped default.
 *
 * Fires the same follow-ups the individual controls do: the seed and γ change
 * the Leiden partition, and the semantic values change which edges exist, so
 * both need their recompute rather than just a settings write.
 */
function handleResetDevSettings() {
	const patch: Partial<SmartGraphSettings> = {};
	for (const key of DEV_TUNABLE_KEYS) {
		(patch as Record<string, unknown>)[key] = DEFAULT_SMART_GRAPH_SETTINGS[key];
	}
	onSettingsChange(patch);
	// Re-runs community detection at the restored seed/γ. The semantic values are
	// part of the parent's rebuild signature, so its own effect handles those.
	onSeedChange?.();
	onReapplySegments?.();
}

// Touch devices have no keyboard modifiers or hover, so the desktop shortcut
// hints ("F", "hold Shift + drag", "shift/⌘ multi-select") describe gestures
// the user cannot perform. Drop them on mobile rather than advertise a
// non-existent affordance.
const onMobile = isMobileUI();
const fitTooltip = onMobile ? "适应视图" : "适应视图 (F)";
const lassoTooltip = onMobile ? "框选" : "框选（或按住 Shift 拖动）";

// Pointer/keyboard focus on the topic-naming button, which turns the spinner
// into a cancel control. Tracked here because Button exposes no hover state.
// On mobile there is no hover, so the X shows for the whole run instead of
// hiding the only way to stop it.
let labelButtonHot = $state(false);
let labelButtonEl = $state<HTMLButtonElement | undefined>(undefined);
const showCancelLabeling = $derived(isLabeling && (labelButtonHot || onMobile));

// Listener wiring + cleanup on a real DOM node — the one job $effect is for.
$effect(() => {
	const el = labelButtonEl;
	if (!el) return;

	const enter = () => {
		labelButtonHot = true;
	};
	const leave = () => {
		labelButtonHot = false;
	};
	el.addEventListener("mouseenter", enter);
	el.addEventListener("mouseleave", leave);
	el.addEventListener("focus", enter);
	el.addEventListener("blur", leave);
	return () => {
		el.removeEventListener("mouseenter", enter);
		el.removeEventListener("mouseleave", leave);
		el.removeEventListener("focus", enter);
		el.removeEventListener("blur", leave);
	};
});
</script>

<!--
  Unified vertical toolbar.

  Icons are `m` (18px), not Button's `s` (16px) default. This rail is a standing
  stack of tool toggles floating over the canvas — the same pattern as Obsidian's
  ribbon and nav-action buttons, which are 18px/30px. The 16px default matches
  view-header actions instead, which is a different, denser pattern, and at this
  size the rail read as undersized against the canvas.
-->
<div class="graph-toolbar" bind:clientWidth={toolbarWidth}>
  <!-- Mobile only. Immersion is a mode rather than a transient result — it
       persists while you pan, select and immerse further — so its exit has to
       persist too without covering the canvas, which a bottom sheet would.
       Desktop needs none of this: the selection bar is a slim strip that already
       carries "Exit" without blocking anything, so a rail button there would
       just be the same action twice. Accented so the rail also answers "why am
       I only seeing some of my notes?". -->
  {#if isImmersed && onMobile}
    <Button
      iconId="log-out"
      onClick={() => onExitImmerse?.()}
      tooltip="退出沉浸——返回完整图谱"
      styles="is-active"
    />
  {/if}
  <Button iconId="maximize" onClick={onFitToView} tooltip={fitTooltip} />
  <Button
    iconId="lasso"
    tooltip={lassoMode ? "退出框选" : lassoTooltip}
    onClick={() => onLassoModeChange?.(!lassoMode)}
    styles={lassoMode ? "is-active" : ""}
  />
  <!-- Show/hide detected topics. Display-only, so flipping it is instant and the
       graph underneath is unchanged — that's what makes it readable as "here is
       what the clustering added". -->
  <!-- A wand rather than a shape: the point of this toggle is that the topics
       were *found for you*, not that regions appear. `shapes`/`circle-dashed`
       named the visible result, which read as a drawing option and gave no hint
       there was anything inferred behind it. One icon across both states, since
       the `is-active` tint already carries on/off — swapping the glyph as well
       made the control look like two different buttons. -->
  <Button
    iconId="wand-sparkles"
    tooltip={showTopics
      ? "隐藏主题——显示未聚类的原始图谱"
      : "显示主题——按检测到的主题为笔记着色"}
    onClick={() => onSettingsChange({ showTopics: !showTopics })}
    styles={showTopics ? "is-active" : ""}
  />
  <!-- Chevrons rather than `group`/`ungroup`: Lucide's group icon is a dashed
       selection marquee around two rectangles, which means "group the selected
       objects" in a design tool — there is no marquee here, and its corner
       brackets collided with `maximize` on this same rail. Converging and
       diverging chevrons are the collapse/expand idiom from every tree and
       outline UI, and say exactly what happens: many nodes fold into one, one
       unfolds back into many. The glyph swaps per state because this action is
       genuinely bidirectional, unlike the show/hide toggle above it. -->
  <Button
    iconId={isTopicsCollapsed ? "chevrons-up-down" : "chevrons-down-up"}
    tooltip={isLeidenRunning
      ? "正在计算主题…"
      : !showTopics
        ? "请先开启主题再折叠"
        : isTopicsCollapsed
          ? "将所有主题展开为笔记（S）"
          : "将所有主题折叠为单个节点（S）——也可选中主题后使用“折叠”"}
    onClick={() => onToggleCollapseAll?.()}
    disabled={isLeidenRunning || !showTopics}
    styles={isTopicsCollapsed ? "is-active" : ""}
  />
  <div class="toolbar-icon-wrapper">
    <Button
      iconId="sliders-horizontal"
      tooltip={isCollapsed ? "显示图谱面板" : "隐藏图谱面板"}
      onClick={() => (isCollapsed = !isCollapsed)}
      styles={!isCollapsed ? "is-active" : ""}
    />
  </div>
  {#if import.meta.env.DEV}
    <div class="toolbar-icon-wrapper">
      <Button
        iconId="wrench"
        tooltip={isDevCollapsed ? "显示开发面板" : "隐藏开发面板"}
        onClick={() => (isDevCollapsed = !isDevCollapsed)}
        styles={!isDevCollapsed ? "is-active" : ""}
      />
    </div>
  {/if}
</div>

<!--
  The panel's controls, defined once and rendered into whichever container the
  platform calls for: a floating popover on desktop, a bottom sheet on mobile.
  One copy of the markup, so a control added here cannot go missing from one
  modality.
-->
{#snippet panelBody()}
  <div class="graph-controls-body">
    <!-- ── Stats row ──────────────────────────── -->
    <div class="stats-row">
      <span class="stats-text">
        {#if isLoading}
          <span class="loading-label">{loadingLabel}</span>
        {:else if graphStats}
          {nodeCount} 篇笔记 · {graphStats.unlinkedNotes} 篇未链接 · {graphStats.wikiEdges} 条链接{#if graphStats.semanticEdges > 0}{" "}· {graphStats.semanticEdges} 条推断{/if}
        {:else}
          {nodeCount} 篇笔记
        {/if}
      </span>
    </div>

    <!-- ── Topics ───────────────────────────── -->
    <!-- Granularity and "Inferred links" both decide *which topics exist*
         (they re-run Leiden), so they belong together and above the topic list
         they produce. Everything under Display only changes how the same topics
         are drawn.

         `setting-group` / `setting-items` are Obsidian's own classes, not ours:
         the heading sits outside the card and `.setting-items` paints the
         lighter offset background, with radius and border coming from
         `--setting-items-*`. Using core's structure means the panel tracks the
         user's theme instead of approximating it. -->
    <div class="setting-group">
      <SettingContainer name="主题" isHeading />
      <div class="setting-items">

    <!-- Held back until the vault's levels are known: the slider's length is
         derived, so showing it early would change its range under the user. -->
    {#if granularityReady}
      <!-- Distinct from the camera zoom (scroll, +/-), which changes scale.
           This changes how finely notes are grouped into topics — hence the
           separate `granularity*` vocabulary throughout. -->
      <SettingContainer
        name="粒度"
        desc={onMobile
          ? "向左：少数宽泛的主题；向右：多个具体的主题。每篇笔记都保持可见。"
          : "向左：少数宽泛的主题；向右：多个具体的主题。每篇笔记都保持可见。（在图谱上按 ↑/↓）"}
        compact
      >
        <RangeSlider
          value={granularityLevel}
          min={MIN_GRANULARITY_LEVEL}
          max={granularityMaxLevel}
          step={1}
          showValue={true}
          onchange={(v) => onGranularityChange?.(v)}
          oncommit={(v) => onGranularityCommit?.(v)}
        />
      </SettingContainer>
    {:else}
      <SettingContainer name="粒度" desc="正在推算该仓库的主题层级…" compact>
        <span class="granularity-pending">…</span>
      </SettingContainer>
    {/if}

    <!-- One switch for the whole concept: inferred links are either part of the
         graph (drawn *and* grouping notes) or absent. Splitting "draw" from
         "count" allowed a state where hidden edges silently decided the topics.

         A plain compact row like every other setting here: `inferredLinksHint`
         folds the live measurement into the same hover description, so the
         number is still there without this row growing an extra line and an
         affordance nothing else in the panel has. -->
    <SettingContainer name="推断连线" desc={inferredLinksHint} compact>
      <!-- Disabled, not hidden, without a graph index: the stored value is kept
           (flipping it would silently rewrite settings on every open), the
           hint says what's missing, and the switch comes alive the moment an
           index is picked. -->
      <Toggle
        checked={!(settings.linkOnlyTopics ?? false) && (settings.showSemanticLinks ?? true)}
        disabled={!hasGraphIndex}
        onchange={(value) =>
          onSettingsChange({ linkOnlyTopics: !value, showSemanticLinks: value })}
      />
    </SettingContainer>
      </div>
    </div>

    {#if segments.length > 0}
      <div class="setting-group">
      <!-- A heading row like the others, so the naming button lands in the
           control slot Obsidian already right-aligns rather than needing a
           bespoke flex row. -->
      <SettingContainer name="已找到 · {segments.length}" isHeading class="section-heading--action">
        {#snippet nameSuffix()}
          {#if !onMobile}<span class="section-label-hint">shift/⌘ 多选</span>{/if}
        {/snippet}
        <!-- The spinner doubles as the cancel control: hovering (or focusing)
             a live run swaps it for an X. Listeners go on the button itself
             rather than a wrapper — it is already focusable, so keyboard users
             reach the cancel affordance by tabbing to it. -->
        <Button
          bind:element={labelButtonEl}
          iconId={showCancelLabeling ? "x" : isLabeling ? "loader" : "sparkles"}
          ariaLabel={isLabeling ? "取消命名主题" : "用 AI 命名主题"}
          tooltip={isLabeling ? "取消命名" : "用 AI 命名主题"}
          onClick={() => (isLabeling ? onCancelLabeling?.() : onLabelTopics?.())}
          styles={isLabeling && !showCancelLabeling ? "is-spinning" : ""}
        />
      </SettingContainer>
      <div class="setting-items segment-list">
        {#each segments as seg (seg.id)}
          <button
            type="button"
            class="segment-row"
            class:segment-row--active={focusedSegmentIds.has(seg.id)}
            onclick={(e) => onFocusSegment?.(seg.id, e.shiftKey || e.metaKey || e.ctrlKey)}
          >
            <span class="segment-dot" style="background-color: {seg.color}"></span>
            <span class="segment-label">{seg.label}</span>
            <span class="segment-count">{seg.paths.size}</span>
          </button>
        {/each}
      </div>
      </div>
    {/if}

    <!-- ── Scope ────────────────────────────── -->
    <!-- What is in the graph at all. Placed after Topics rather than before it:
         it is the rarest thing to touch — usually set once and left — so the
         controls reached on every visit stay at the top, where the topic list
         can also sit directly under the settings that produce it. -->
    <div class="setting-group">
      <SettingContainer name="范围" isHeading />
      <div class="setting-items">
    <SettingContainer
      name="仅 Markdown"
      desc="仅显示 Markdown 笔记；关闭则显示所有可索引的文件"
      compact
    >
      <Toggle
        checked={settings.markdownOnly}
        onchange={(value) => onSettingsChange({ markdownOnly: value })}
      />
    </SettingContainer>
    <SettingContainer
      name="标签"
      desc="把每个标签画成节点，连到带有该标签的笔记上；共用的标签也有助于主题成形"
      compact
    >
      <Toggle
        checked={settings.showTags ?? false}
        onchange={(value) => onSettingsChange({ showTags: value })}
      />
    </SettingContainer>
      </div>
    </div>

    <!-- ── Display ───────────────────────────── -->
    <!-- Purely how the graph above is drawn — nothing here changes which notes
         are included or how they group. -->
    <div class="setting-group">
      <SettingContainer name="显示" isHeading />
      <div class="setting-items">
    <SettingContainer
      name="主题区域"
      desc="为每个主题背后的区域着色，一眼就能看清分组"
      compact
    >
      <Toggle
        checked={settings.showTopicHulls ?? true}
        onchange={(value) => onSettingsChange({ showTopicHulls: value })}
      />
    </SettingContainer>
    <SettingContainer
      name="主题标签"
      desc="在图谱上方显示主题名称标签"
      compact
    >
      <Toggle
        checked={settings.showClusterLabels ?? true}
        onchange={(value) => onSettingsChange({ showClusterLabels: value })}
      />
    </SettingContainer>
    <SettingContainer
      name="方向箭头"
      desc="为有向双链显示箭头"
      compact
    >
      <Toggle
        checked={settings.directedWikiEdges}
        onchange={(value) => onSettingsChange({ directedWikiEdges: value })}
      />
    </SettingContainer>
    <!-- Inferred edges are already dashed, but at overview zoom the dashes sit a
         few pixels apart and read as solid, so the two kinds of connection blur
         together exactly where the question "what did inference add?" is being
         asked. Colour survives that zoom-out where the dash pattern doesn't.

         Disabled rather than hidden when inferred links are off: a row that
         vanishes leaves the user hunting for a control they saw a moment ago,
         and the hint says which switch to flip to get it back. -->
    <SettingContainer
      name="高亮推断连线"
      desc={!hasGraphIndex
        ? "用强调色绘制推断连线。需要一个图谱嵌入索引——请在插件的图谱设置中选择一个。"
        : inferredLinksOn
          ? "用强调色绘制推断连线，使其与你手写的链接区分开"
          : "用强调色绘制推断连线。需要先开启“推断连线”（位于主题分区下）。"}
      compact
    >
      <Toggle
        checked={settings.highlightSemanticLinks ?? false}
        disabled={!hasGraphIndex || !inferredLinksOn}
        onchange={(value) => onSettingsChange({ highlightSemanticLinks: value })}
      />
    </SettingContainer>
    <SettingContainer
      name="高亮孤立笔记"
      desc="用强调色标记没有任何双链的笔记"
      compact
    >
      <Toggle
        checked={settings.highlightIsolated}
        onchange={(value) => onSettingsChange({ highlightIsolated: value })}
      />
    </SettingContainer>
    <SettingContainer
      name="高亮桥接笔记"
      desc="用强调色标记连接了多个主题的笔记"
      compact
    >
      <Toggle
        checked={settings.highlightBridges}
        onchange={(value) => onSettingsChange({ highlightBridges: value })}
      />
    </SettingContainer>
      </div>
    </div>
  </div>
{/snippet}

{#if onMobile}
  <!--
    On a phone the popover was the wrong modality outright: it covered ~76% of
    the viewport it floated over, hung from the least reachable edge, and gave
    a drag-and-watch control (granularity) nothing to watch. The sheet keeps
    the graph visible above it and puts the controls under the thumb.

    Opens at the peek detent, where Topics — the granularity slider and
    inferred links — is what you get; drag up for the topic list and the rest.
  -->
  <BottomSheet
    open={!isCollapsed}
    onClose={() => (isCollapsed = true)}
    ariaLabel="图谱设置"
  >
    {@render panelBody()}
  </BottomSheet>
{:else}
  <div class="graph-controls" class:collapsed={isCollapsed} bind:clientHeight={mainPanelHeight}>
    {#if !isCollapsed}
      {@render panelBody()}
    {/if}
  </div>
{/if}

<!-- Dev panel (dev build only) -->
{#if import.meta.env.DEV}
  <div
    class="graph-controls graph-controls--dev"
    class:collapsed={isDevCollapsed}
    class:graph-controls--main-open={!isCollapsed}
    style="--s2b-graph-main-panel-height: {mainPanelHeight}px"
  >
    {#if !isDevCollapsed}
      <div class="graph-controls-body">
        <button
          type="button"
          class="section-label section-label--collapsible"
          onclick={() => (sectionOpen.devLayout = !sectionOpen.devLayout)}
        >
          <span>布局</span>
          <svg class="section-chevron" class:open={sectionOpen.devLayout} xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        {#if sectionOpen.devLayout}
          <SettingContainer name="连线长度" desc="相连节点之间的目标距离" compact>
            <RangeSlider value={settings.linkDistance} min={30} max={500} step={5} showValue={true} oncommit={handleLinkDistanceChange} />
          </SettingContainer>
          <SettingContainer name="斥力" desc="节点相互排斥的强度" compact>
            <RangeSlider value={Math.abs(settings.chargeStrength)} min={10} max={1500} step={10} showValue={true} oncommit={handleChargeStrengthChange} />
          </SettingContainer>
          <SettingContainer name="向心力" desc="图谱被拉向中心的强度" compact>
            <RangeSlider value={Math.round(settings.centerStrength * 100)} min={0} max={100} step={1} showValue={true} oncommit={handleCenterStrengthChange} />
          </SettingContainer>
          <SettingContainer name="连线强度" desc="连线把相连节点拉近的强度" compact>
            <RangeSlider value={Math.round(settings.linkStrength * 100)} min={0} max={100} step={1} showValue={true} oncommit={handleLinkStrengthChange} />
          </SettingContainer>
          <SettingContainer name="主题内聚" desc="节点被拉向所属主题中心的强度" compact>
            <RangeSlider value={Math.round((settings.clusterCohesionStrength ?? 0.15) * 100)} min={0} max={100} step={1} showValue={true} oncommit={handleClusterCohesionStrengthChange} />
          </SettingContainer>
        {/if}

        <button
          type="button"
          class="section-label section-label--collapsible"
          onclick={() => (sectionOpen.devAppearance = !sectionOpen.devAppearance)}
        >
          <span>外观</span>
          <svg class="section-chevron" class:open={sectionOpen.devAppearance} xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        {#if sectionOpen.devAppearance}
          <SettingContainer name="有向连线" desc="在手写的双链上绘制箭头" compact>
            <Toggle checked={settings.directedWikiEdges ?? true} onchange={(v) => onSettingsChange({ directedWikiEdges: v })} />
          </SettingContainer>
          <SettingContainer name="主题区域" desc="每个主题笔记背后的着色区域" compact>
            <Toggle checked={settings.showTopicHulls ?? true} onchange={(v) => onSettingsChange({ showTopicHulls: v })} />
          </SettingContainer>
          <SettingContainer name="主题标签" desc="绘制在每个主题上方的名称标签" compact>
            <Toggle checked={settings.showClusterLabels ?? true} onchange={(v) => onSettingsChange({ showClusterLabels: v })} />
          </SettingContainer>
          <SettingContainer name="高亮桥接笔记" desc="为邻居大多在其他主题中的笔记加上环形标记" compact>
            <Toggle checked={settings.highlightBridges ?? false} onchange={(v) => { onSettingsChange({ highlightBridges: v }); onReapplySegments?.(); }} />
          </SettingContainer>
          <SettingContainer name="高亮未链接笔记" desc="为没有手写链接的笔记加上环形标记" compact>
            <Toggle checked={settings.highlightIsolated ?? false} onchange={(v) => { onSettingsChange({ highlightIsolated: v }); onReapplySegments?.(); }} />
          </SettingContainer>
          <SettingContainer name="仅 Markdown" desc="从图谱中排除非 Markdown 文件" compact>
            <Toggle checked={settings.markdownOnly ?? false} onchange={(v) => onSettingsChange({ markdownOnly: v })} />
          </SettingContainer>
        {/if}

        <button
          type="button"
          class="section-label section-label--collapsible"
          onclick={() => (sectionOpen.devSemantic = !sectionOpen.devSemantic)}
        >
          <span>语义连线</span>
          <svg class="section-chevron" class:open={sectionOpen.devSemantic} xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        {#if sectionOpen.devSemantic}
          <SettingContainer name="邻居数 (k)" desc="每篇笔记最多贡献的推断邻居数" compact>
            <RangeSlider
              value={settings.semanticNeighborCount ?? 5}
              min={0}
              max={20}
              step={1}
              showValue={true}
              oncommit={(v) => onSettingsChange({ semanticNeighborCount: v })}
            />
          </SettingContainer>
          <SettingContainer name="相似度阈值" desc="生成推断连线所需的最小余弦相似度（×100）" compact>
            <RangeSlider
              value={Math.round((settings.semanticThreshold ?? 0.55) * 100)}
              min={0}
              max={100}
              step={1}
              showValue={true}
              oncommit={(v) => onSettingsChange({ semanticThreshold: v / 100 })}
            />
          </SettingContainer>
        {/if}

        <button
          type="button"
          class="section-label section-label--collapsible"
          onclick={() => (sectionOpen.devLeiden = !sectionOpen.devLeiden)}
        >
          <span>Leiden</span>
          <svg class="section-chevron" class:open={sectionOpen.devLeiden} xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        {#if sectionOpen.devLeiden}
          <SettingContainer name="随机种子" desc="伪随机数种子——相同种子 + 相同图谱 = 相同主题" compact>
            <input
              type="number"
              class="dev-number-input"
              value={settings.leidenSeed ?? 42}
              min={0} max={999999} step={1}
              onchange={(e) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (Number.isFinite(v)) { onSettingsChange({ leidenSeed: Math.round(v) }); onSeedChange?.(); }
              }}
            />
          </SettingContainer>
          <SettingContainer name="分辨率 (γ)" desc="取值越大 → 主题更多更小。粒度滑块背后的实际取值" compact>
            <RangeSlider
              value={Math.round((settings.leidenResolution ?? 1) * 100)}
              min={10}
              max={600}
              step={5}
              showValue={true}
              oncommit={(v) => handleResolutionChange(v / 100)}
            />
          </SettingContainer>
          <SettingContainer name="桥接阈值" desc="判定为桥接笔记所需的跨主题邻居最小比例" compact>
            <RangeSlider value={Math.round((settings.bridgeThreshold ?? 0.4) * 100)} min={0} max={100} step={5} showValue={true} oncommit={(v) => { onSettingsChange({ bridgeThreshold: v / 100 }); onReapplySegments?.(); }} />
          </SettingContainer>
          <SettingContainer name="仅按链接划分主题" desc="仅根据手写链接检测主题，忽略推断连线" compact>
            <Toggle checked={settings.linkOnlyTopics ?? false} onchange={(v) => onSettingsChange({ linkOnlyTopics: v })} />
          </SettingContainer>
        {/if}

        <div class="dev-actions">
          <Button iconId="rotate-ccw" onClick={handleResetDevSettings} tooltip="调参恢复默认值" />
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .graph-toolbar {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    /* Sits in the gap between the sheet's dismiss layer (12) and the sheet
       itself (14): above the layer so fit / lasso / topics stay pressable
       while a sheet is open — and so the sliders button keeps working as the
       sheet's own toggle — but below the sheet, which is opaque. Putting the
       toolbar above the sheet instead left the icons painted over the sheet's
       own controls. */
    z-index: 13;
  }

  /* A vertical rail runs straight down into the sheet: at the 44px mobile touch
     size the column is ~294px tall, so five of its six buttons ended up behind
     the sheet — including the sliders button that closes it. Laid out as a row
     it occupies the strip above the sheet instead, which stays clear even at
     the full detent (the row ends ~6px above a 90%-height sheet).

     Right-aligned so it keeps its corner rather than stretching across the
     canvas, and wrapped so a narrower phone drops buttons to a second row
     instead of pushing them off-screen. */
  :global(.is-mobile) .graph-toolbar {
    flex-direction: row-reverse;
    flex-wrap: wrap-reverse;
    justify-content: flex-start;
    max-width: calc(100vw - 16px);
  }

  /* Sized here rather than via Button's `iconSize` prop: for an icon-only button
     that prop also pins width/height to the icon size as an inline style, which
     would shrink the click target to 18px — a bigger glyph on a smaller thing to
     hit. Setting both from CSS keeps them independent.

     18px/30px matches Obsidian's ribbon and nav-action buttons. This rail is that
     pattern — a standing stack of tool toggles — not the denser 16px/28px
     view-header strip that Button defaults to. */
  .graph-toolbar :global(button.clickable-icon) {
    width: 30px;
    height: 30px;
  }

  .graph-toolbar :global(button.clickable-icon .s2b-button-icon) {
    width: var(--icon-m);
    height: var(--icon-m);
  }

  .graph-toolbar :global(button.clickable-icon svg) {
    width: var(--icon-m);
    height: var(--icon-m);
  }

  /* These render at 30x26 — well under the touch floor, and they're the only
     way to fit/lasso/segment the graph on a phone. Grow the tappable box via
     padding so the glyphs keep their size. */
  :global(.is-mobile) .graph-toolbar :global(button) {
    min-width: 44px;
    min-height: 44px;
    padding: 10px;
    box-sizing: border-box;
  }

  .toolbar-icon-wrapper {
    position: relative;
    display: flex;
  }

  .graph-controls {
    position: absolute;
    top: 8px;
    right: 52px;
    width: 300px;
    max-height: calc(100% - 16px);
    overflow-y: auto;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    z-index: 10;
    box-shadow: none;
  }

  /* Only the dev panel still uses this popover on mobile — the shipped settings
     panel is a bottom sheet there, which owns its own width. A fixed 300px box
     plus the 52px toolbar offset overflows a phone, so fit it to the viewport. */
  :global(.is-mobile) .graph-controls--dev {
    width: min(300px, calc(100vw - 68px));
  }

  .graph-controls.collapsed {
    display: none;
  }

  /* Same column as the main panel rather than offset to its left: the two are
     toggled independently, so a fixed sideways offset left the dev panel
     floating over open canvas whenever the main panel was closed. Stacking
     below it keeps both anchored to the toolbar they belong to; when the main
     panel is closed this is the only thing in the column and sits right under
     the toolbar. */
  .graph-controls--dev {
    top: 8px;
    right: 52px;
  }

  /* Clear the main panel when both are open. It is 300px wide with a 16px
     viewport allowance, so cap the dev panel's own height to what is left. */
  .graph-controls--main-open {
    top: calc(8px + var(--s2b-graph-main-panel-height, 0px) + 8px);
    max-height: calc(100% - 24px - var(--s2b-graph-main-panel-height, 0px));
  }

  .graph-controls-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* The sheet supplies its own horizontal padding and safe-area bottom, so the
     popover's would double it. Scoped to the sheet rather than to `.is-mobile`,
     because the dev panel shares this class and still renders as a popover
     there — it needs to keep its own padding. */
  :global(.s2b-bottom-sheet) .graph-controls-body {
    padding: 0;
  }

  /* Centred: this is a caption describing the whole graph, not a labelled
     setting, so aligning it to the settings' left edge made it read as a row
     that had lost its control. The rule underneath is gone too — the grouped
     cards below now provide the separation it was drawing by hand. */
  .stats-row {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0 16px 10px;
  }

  .stats-text {
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .loading-label {
    color: var(--text-faint);
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding-top: 8px;
    padding-bottom: 2px;
  }

  .granularity-pending {
    font-size: var(--font-ui-small);
    color: var(--text-faint);
    padding-right: 4px;
  }

  /* A heading row carries no control by default, so it has no min-height to
     stop the naming button from squashing it. */
  :global(.section-heading--action) {
    min-height: 32px;
  }

  /* Core sizes `.setting-group` for a full-width settings tab
     (`--setting-group-max-width`, centred). This panel is a narrow column, so
     let the group take whatever width it is given instead. */
  .graph-controls-body :global(.setting-group) {
    max-width: none;
    width: 100%;
  }

  .graph-controls-body :global(.setting-group + .setting-group) {
    margin-top: 12px;
  }

  /* Core's card padding is sized for a full settings tab (20px each side on
     top of each item's own 16px). That is too airy for a panel this narrow.

     The background is set explicitly rather than left to
     `--setting-items-background`: outside a settings tab that variable resolves
     to the same darker value as the surface behind it, so the cards vanished
     into their own container. `--background-primary` is the lighter of the
     pair, which is the way round a settings tab actually renders. */
  .graph-controls-body :global(.setting-items) {
    padding-block: 4px;
    background-color: var(--background-primary);
  }

  /* The label button reuses Obsidian's clickable-icon chrome; only the spin is ours. */
  :global(.is-spinning svg) {
    animation: s2b-label-spin 1s linear infinite;
  }

  @keyframes s2b-label-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .section-label-hint {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    font-size: 10px;
    color: var(--text-faint);
    margin-left: 4px;
  }

  .section-chevron {
    transition: transform 0.15s ease;
    transform: rotate(-90deg);
    flex-shrink: 0;
  }

  .section-chevron.open {
    transform: rotate(0deg);
  }

  /* Segment list */
  /* The topic list is unbounded — a high granularity level can produce dozens of
     entries. Cap it and let it scroll on its own, so it can never push the
     Display toggles (or itself) out of the panel. */
  .segment-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    /* 10px + the row's own 6px lands the dots on the same 16px edge as the
       setting names and section headings. */
    padding: 6px 10px;
    max-height: 40vh;
    overflow-y: auto;
    /* Without this a flex child refuses to shrink below its content height,
       which would defeat the cap entirely. */
    min-height: 0;
    overscroll-behavior: contain;
  }

  /* Inside the sheet the cap is not only unnecessary but actively wrong: the
     full detent exists so the topic list can use the height, and a nested
     scroll area within a scrolling sheet gives two overlapping scroll targets
     under one thumb. Let the list run, and let the sheet scroll it. */
  :global(.is-mobile) .segment-list {
    max-height: none;
    overflow-y: visible;
  }

  .segment-row {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 3px 6px;
    background: none;
    border: none;
    border-radius: 4px;
    /* Not a literal `pointer`: Obsidian's base `button` rule already resolves
       to var(--cursor), and hardcoding here made these rows disagree with the
       toolbar rail whenever "Use pointer cursor for clickable elements" is off. */
    cursor: var(--cursor);
    color: var(--text-normal);
    text-align: left;
    transition: background-color 0.1s ease;
  }

  .segment-row:hover {
    background: var(--background-modifier-hover);
  }

  /* A 3px-padded row lands around 22px — half the touch floor, on the one list
     in this panel you are meant to tap repeatedly. */
  :global(.is-mobile) .segment-row {
    min-height: 44px;
    padding: 6px 8px;
  }

  .segment-row--active {
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-primary));
  }

  .segment-dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    min-width: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .segment-label {
    flex: 1;
    font-size: var(--font-ui-small);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .segment-count {
    font-size: 0.7rem;
    color: var(--text-faint);
    flex-shrink: 0;
  }

  .dev-number-input {
    width: 72px;
    padding: 2px 6px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-normal);
    font-size: var(--font-ui-small);
    text-align: right;
  }

  .section-label--collapsible {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: none;
    cursor: var(--cursor);
    padding: 0;
  }

  .section-label--collapsible:hover {
    color: var(--text-normal);
  }

  .dev-actions {
    display: flex;
    gap: 4px;
    padding-top: 4px;
  }
</style>
