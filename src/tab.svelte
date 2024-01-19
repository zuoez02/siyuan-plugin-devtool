<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { VersionManager } from "./VersionManager";
  import { Chart, type EChartsOptions } from "svelte-echarts";

  const vm = new VersionManager();

  let options: EChartsOptions = {};

  let types = ["all", "plugin", "template", "widget", "theme"];

  let userRepos: any[] = [];

  let selectedRankType = "all";

  $: namedUserRepos = (() => {
    let result = userRepos;
    if (username) {
      result = result.filter((v) => v.username === username);
    }
    if (selectedRankType !== "all") {
      result = result.filter((v) => v.type === selectedRankType);
    }
    return result.sort((a, b) => b.downloads - a.downloads);
  })();

  $: total = (() => {
    return namedUserRepos.reduce((a, i) => (i.downloads || 0) + a, 0);
  })();

  $: () => {
    if (selectedRankType) {
      updateEcharts();
    }
  };

  const update = () => {
    dispatch("update", username);
  };

  const dispatch = createEventDispatcher();

  onMount(async () => {
    await vm.init();
    userRepos = await vm.getUserRepos();
    updateEcharts();
  });

  const getStyle = (type: string) => {
    const result = {
      color: "white",
      backgroundColor: ["red", "blue", "orange", "green"][
        ["theme", "template", "plugin", "widget"].findIndex((v) => v === type)
      ],
      border: "0",
      borderRadius: "4px",
      padding: "2px 4px",
      display: "inline-block",
    };
    return Object.entries(result)
      .map((v) => `${v[0]}: ${v[1]}`)
      .join(";");
  };

  //   const refresh = () => {
  //     userRepos = vm.getUserRepos();
  //     updateEcharts();
  //   };

  const updateEcharts = () => {
    let repos;
    if (selectedRankType === "all") {
      repos = userRepos;
    } else {
      repos = userRepos.filter((v) => v.type === selectedRankType);
    }
    const total: { [key: string]: number } = {};
    repos.forEach((p) => {
      total[p.username] = total[p.username]
        ? total[p.username] + p.downloads
        : p.downloads;
    });
    const entries = Object.entries(total);
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    options = {
      tooltip: {
        show: true,
      },
      xAxis: {
        data: sorted.map((s) => s[0]),
      },
      yAxis: {
        show: true,
      },
      series: [
        {
          name: "Rank",
          type: "bar",
          data: sorted.map((s) => s[1]),
        },
      ],
    };
    console.log(options);
  };

  export let username = "";
</script>

<div class="devtool-plugin-tab" style="padding: 12px">
  <h1>Developer Tools</h1>
  <div style="margin: 12px 0 5px">
    <span>username:</span>
    <input class="b3-input" style="margin: 0 12px;" bind:value={username} />
    <button class="b3-button" on:click={update}>Save</button>
  </div>
  <div>
    {#each types as t}
      <button
        class="b3-button"
        style="margin-right: 8px"
        on:click={() => (selectedRankType = t)}>{t}</button
      >
    {/each}
  </div>
  <div style="display: flex; flex-wrap: wrap;">
    <h2 style="margin: 12px 0 5px; width: 100%">Repos</h2>
    <div style="margin: 6px 0; width: 100%">Total Downloads: {total}</div>
    <div style="margin: 6px 0; width: 100%">
      Total Count: {namedUserRepos.length}
    </div>
    <div class="user-repo-container">
      {#each namedUserRepos as p}
        {#if p.package}
          <div class="user-repo">
            <div>
              <dt>Name:&nbsp</dt>
              <dd style="display: inline-block">
                <a href={p.package.url} target="_blank"
                  >{(p?.package?.displayName || {})["zh_CN"] ||
                    (p?.package?.displayName || {})["default"] ||
                    p?.package?.name}</a
                >
              </dd>
            </div>
            {#if !username}
              <div>
                <dt>Username:&nbsp</dt>
                <dd style="display: inline-block">{p.username}</dd>
              </div>
            {/if}
            <div>
              <dt>Type:&nbsp</dt>
              <dd style={getStyle(p.type)}>{p.type}</dd>
            </div>
            <div>
              <dt>Download:&nbsp</dt>
              <dd style="display: inline-block">{p.downloads}</dd>
            </div>
            <div>
              <dt>Version:&nbsp</dt>
              <dd style="display: inline-block">{p.package.version}</dd>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </div>
  <div style="margin: 12px 0 5px">
    <h2>Rank</h2>

    <div id="echarts" style="width: 100%; height: 400px">
      <Chart bind:options />
    </div>
  </div>
</div>
