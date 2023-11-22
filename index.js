const { Plugin, openTab, Menu, getFrontend } = require('siyuan');

const TAB_TYPE = 'devtool-plugin';
const version = window.siyuan.config.system.kernelVersion;

const addScriptSync = (path, id) => {
    if (document.getElementById(id)) {
        return false;
    }
    const xhrObj = new XMLHttpRequest();
    xhrObj.open("GET", path, false);
    xhrObj.setRequestHeader("Accept",
        "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript, */*; q=0.01");
    xhrObj.send("");
    const scriptElement = document.createElement("script");
    scriptElement.type = "text/javascript";
    scriptElement.text = xhrObj.responseText;
    scriptElement.id = id;
    document.head.appendChild(scriptElement);
};

const Constants = {
    AliyunServer: "https://siyuan-sync.b3logfile.com", // 云端服务地址，阿里云负载均衡，用于接口，数据同步文件上传、下载会走七牛云 OSS SiYuanSyncServer
    SiYuanSyncServer: "https://siyuan-data.b3logfile.com/", // 云端数据同步服务地址，七牛云 OSS，用于数据同步文件上传、下载
    BazaarStatServer: "http://bazaar.b3logfile.com", // 集市包统计服务地址，直接对接 Bucket 没有 CDN 缓存
    BazaarOSSServer: "https://oss.b3logfile.com", // 云端对象存储地址，七牛云，仅用于读取集市包
    LiandiServer: "https://ld246.com", // 链滴服务地址，用于分享发布帖子
};

const URLS = {
    DOWNLOAD_COUNTS: `${Constants.BazaarStatServer}/bazaar/index.json`,
};

class VersionManager {
    constructor() {
        this.version = null;
        this.bazaarHash = '';
        this.downloadCounts = null;
        this.plugins = null;
        this.templates = null;
        this.themes = null;
        this.widgets = null;
    }

    async init() {
        await this.getDownloadCounts();
        await this.getSiyuanVersions();
        await this.getResources();
    }

    getUserRepos() {
        return [...this.plugins, ...this.templates, ...this.themes, ...this.widgets].map((p) => {
            const reponame = p?.url.split('@')[0];
            const author = reponame.split('/')[0];
            return {
                ...p,
                username: author,
                type: p.type,
                downloads: this.downloadCounts[reponame]?.downloads || 0,
            }
        });
    }

    async getSiyuanVersions() {
        this.version = await fetch(`${Constants.AliyunServer}/apis/siyuan/version?ver=${version}`, { method: 'GET' }).then((res) => res.json())
        this.bazaarHash = this.version.bazaar;
    }

    async getResources() {
        return Promise.all([
            fetch(`${Constants.BazaarOSSServer}/bazaar@${this.bazaarHash}/stage/plugins.json`).then((res) => res.json()),
            fetch(`${Constants.BazaarOSSServer}/bazaar@${this.bazaarHash}/stage/templates.json`).then((res) => res.json()),
            fetch(`${Constants.BazaarOSSServer}/bazaar@${this.bazaarHash}/stage/themes.json`).then((res) => res.json()),
            fetch(`${Constants.BazaarOSSServer}/bazaar@${this.bazaarHash}/stage/widgets.json`).then((res) => res.json()),
        ]).then((arr) => {
            this.plugins = arr[0].repos.map((v) => ({...v, type: 'plugin' }));
            this.templates = arr[1].repos.map((v) => ({...v, type: 'template' }));
            this.themes = arr[2].repos.map((v) => ({...v, type: 'theme' }));
            this.widgets = arr[3].repos.map((v) => ({...v, type: 'widget' }));
        });
    }

    async getDownloadCounts() {
        const res = await fetch(`${URLS.DOWNLOAD_COUNTS}`, { method: 'GET' }).then((res) => res.json())
        this.downloadCounts = res;
    }
}

class DevlToolComponent {
    constructor(plugin) {
        this.plugin = plugin;
    }

    init(el) {
        this.addVue();
        this.el = el;
        this.setUsername(this.plugin.config.username);
        this.mountEl();
    }

    setUsername(username) {
        this.username = username;
    }

    updateUsername(username) {
        this.plugin.setUsername(username);
    }

    addVue() {
        addScriptSync('/plugins/siyuan-plugin-devtool/vue.js', 'vue');
        addScriptSync('/plugins/siyuan-plugin-devtool/echarts.js', 'echarts');
    }

    mountEl() {
        const c = this;
        Vue.createApp({
            data: () => {
                return {
                    vm: new VersionManager(),
                    echart: null,
                    username: c.username || '',
                    userRepos: [],
                    selectedRankType: 'all',
                    types: ['all', 'plugin', 'template', 'widget', 'theme']
                };
            },
            async mounted() {
                await this.vm.init();
                this.userRepos = await this.vm.getUserRepos();
                const el = this.$el.querySelector('#echarts');
                this.echart = echarts.init(el);
                this.updateEcharts();
            },
            methods: {
                updateEcharts() {
                    let repos;
                    if (this.selectedRankType === 'all') {
                        repos = this.userRepos;
                    } else {
                        repos = this.userRepos.filter((v) => v.type === this.selectedRankType);
                    }
                    const total = {};
                    repos.forEach((p) => {
                        total[p.username] = total[p.username] ? (total[p.username] + p.downloads) : p.downloads;
                    });
                    const entries = Object.entries(total);
                    const sorted = entries.sort((a, b) => b[1] - a[1]);
                    const option = {
                        tooltip: {
                            show: true,
                        },
                        xAxis: {
                            data: sorted.map(s => s[0]),
                        },
                        yAxis: {
                            show: true,
                        },
                        series: [{
                            name: 'Rank',
                            type: 'bar',
                            data: sorted.map(s => s[1]),
                        }]
                    };
                    this.echart.setOption(option)
                    this.echart.on('click', (e) => {
                        this.username = e.name;
                    })
                },
                refresh() {
                    this.userRepos = this.vm.getUserRepos();
                    this.updateEcharts();
                },
                async update() {
                    c.updateUsername(this.username);
                },
                getStyle(type) {
                    return {
                        color: 'white',
                        backgroundColor: ['red', 'blue', 'orange', 'green'][
                            ['theme', 'template', 'plugin', 'widget'].findIndex((v) => v === type)
                        ],
                        border: '0',
                        borderRadius: '4px',
                        padding: '2px 4px',
                        display: 'inline-block',
                    }
                }
            },
            computed: {
                total() {
                    return this.namedUserRepos.reduce((a, i) => (i.downloads || 0) + a, 0);
                },
                namedUserRepos() {
                    let result = this.userRepos;
                    if (this.username) {
                        result = result.filter((v) => v.username === this.username);
                    }
                    if (this.selectedRankType !== 'all') {
                        result = result.filter((v) => v.type === this.selectedRankType);
                    }
                    return result.sort((a, b) => b.downloads - a.downloads);
                }
            },
            watch: {
                selectedRankType() {
                    this.updateEcharts();
                }
            },
            template: `
            <div class="devtool-plugin-tab" style="padding: 12px">
                <h1>Developer Tools</h1>
                <div style="margin: 12px 0 5px">
                    <span>username:</span>
                    <input class="b3-input" style="margin: 0 12px;" v-model="username"/>
                    <button class="b3-button" v-on:click="update">Save</button>
                </div>
                <div>
                    <button class="b3-button" style="margin-right: 8px" v-for="t in types" @click="selectedRankType = t">{{t}}</button>
                </div>
                <div style="display: flex; flex-wrap: wrap;">
                    <h2 style="margin: 12px 0 5px; width: 100%">Repos</h2>
                    <div style="margin: 6px 0; width: 100%">Total Downloads: {{total}}</div>
                    <div style="margin: 6px 0; width: 100%">Total Count: {{ namedUserRepos.length }}</div>
                    <div class="user-repo-container">
                        
                        <template v-for="p in namedUserRepos">
                            <div class="user-repo" v-if="p.package">
                                <div><dt>Name:&nbsp</dt><dd style="display: inline-block"><a :href="p.package.url" target="_blank">{{p.package.displayName['zh_CN'] || p.package.displayName['default'] || p.package.name}}</a></dd></div>
                                <div v-if="!username"><dt>Username:&nbsp</dt><dd style="display: inline-block">{{p.username}}</dd></div>
                                <div><dt>Type:&nbsp</dt><dd :style="getStyle(p.type)">{{p.type}}</dd></div>
                                <div><dt>Download:&nbsp</dt><dd style="display: inline-block">{{p.downloads}}</dd></div>
                                <div><dt>Version:&nbsp</dt><dd style="display: inline-block">{{p.package.version}}</dd></div>
                            </div>
                        </template>
                    </div>
                </div>
                <div style="margin: 12px 0 5px">
                    <h2>Rank</h2>
                    
                    <div id="echarts" ref="echarts" style="width: 100%; height: 400px"></div>
                </div>
            </div>
            `
        }).mount(this.el);
    }
}


module.exports = class DevToolPlugin extends Plugin {
    isMobile = false;

    onload() {
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        this.devtoolComponent = new DevlToolComponent(this);
        this.loadConfig().then(() => {
            if (this.config.vconsole) {
                this.toggleVconsole(this.config.vconsole);
            }
        });

        this.addIcons(`<symbol id="iconDevtools" viewBox="0 0 1024 1024"><path d="M824.85 549.87c-22.72 0-43.23-8.24-59.5-21.41-2.05-1.2-253.51-251.47-253.51-251.47L264.24 524.6c-1.16 1.09-2.6 1.64-3.86 2.56-16.53 13.96-37.57 22.72-60.86 22.72-33.37 0-62.53-17.35-79.39-43.4 10.15 3.29 20.82 5.51 32.06 5.51 35.5 0 64.31-23.99 86.33-44.97 0 0 237.61-233.56 239.28-234.64-8.17-8.51-13.24-19.99-13.24-32.73 0-26.12 21.19-47.29 47.29-47.29 26.18 0 47.38 21.17 47.38 47.29 0 12.74-5.12 24.22-13.25 32.69 1.65 1.12 240.81 236.24 240.81 236.24 16.97 17.09 49.83 44.1 85.18 44.1 11.2 0 21.81-2.22 31.93-5.45-16.8 25.65-45.82 42.64-79.05 42.64zM227.94 814.83h28.38V597.18c0-10.92 255.52-265.02 255.52-265.02S767.4 586.22 767.4 597.18v217.65h28.42c15.66 0 28.36 12.75 28.36 28.39 0 15.72-12.7 28.44-28.36 28.44H227.94c-15.7 0-28.42-12.72-28.42-28.44-0.01-15.65 12.74-28.39 28.42-28.39z m283.89-246.09c26.18 0 47.38-21.18 47.38-47.3 0-26.13-21.19-47.31-47.38-47.31-26.1 0-47.29 21.18-47.29 47.31 0 26.12 21.19 47.3 47.29 47.3z m0 0" p-id="6712"></path></symbol>`)

        this.registerTopbarIcon();
      
        this.addCommand({
            langKey: "reload",
            hotkey: "⇧⌘R",
            callback: () => {
                window.location.reload();
            }
        });

        let component = this.devtoolComponent;
        this.addTab({
            type: TAB_TYPE,
            init() {
                component.init(this.element);
            }
        });
    }

    registerTopbarIcon() {
        const topBarElement = this.addTopBar({
            title: this.i18n.title,
            icon: 'iconDevtools',
            position: 'right',
            callback: () => {
                let rect = topBarElement.getBoundingClientRect();
                // 如果被隐藏，则使用更多按钮
                if (rect.width === 0) {
                    rect = document.querySelector("#barMore").getBoundingClientRect();
                }
                this.showMenu(rect);
            },
        });
    }

    showMenu(rect) {
        const menu = new Menu("siyuanPluginDevtool");
        menu.addItem({
            icon: "iconRefresh",
            label: this.i18n.reload,
            click: () => window.location.reload(),
        });
        if (window.require) {
            menu.addItem({
                icon: 'iconFolder',
                label: this.i18n.openPluginFolder,
                click: () => this.showPluginFolder(),
            });
        }
        menu.addItem({
            icon: "iconDevtools",
            label: this.i18n.developerPanel,
            click: () => this.showDevTool(),
        });
        menu.addSeparator();
        if (window.require) {
            menu.addItem({
                icon: 'iconBug',
                label: this.i18n.openElectronDevTools,
                click: () => this.openElectronDevTools(),
            })
        }
        menu.open({
            x: rect.right,
            y: rect.bottom,
            isLeft: true,
        });
        if (true) {
            menu.addItem({
                icon: "iconBug",
                label: this.i18n.vConsole,
                click: () => {
                    this.toggleVconsole();
                    this.saveConfig();
                }
            })
        }
    }

    toggleVconsole(initial) {
        addScriptSync("/plugins/siyuan-plugin-devtool/vconsole.min.js", "vconsole");
        if (initial === false) {
            return;
        }
        if (this.VConsole) {
            this.VConsole.destroy();
            this.VConsole = null;
            this.config.vconsole = false;
        } else {
            this.VConsole = new window.VConsole();
            this.config.vconsole = true;
        }
    }

    showDevTool() {
        openTab({
            app: this.app,
            custom: {
                icon: 'iconDevtools',
                title: this.i18n.developerPanel,
                data: {},
                id: this.name + TAB_TYPE,
            },
        });
    }

    openElectronDevTools() {
        if (!window.require) {
            return;
        }
        const remote = window.require('@electron/remote');
        remote?.getCurrentWindow().webContents.openDevTools()
    }

    showPluginFolder() {
        if (!window.require) {
            return;
        }
        const path = window.require('path');
        const {shell} = window.require('@electron/remote') // deconstructing assignment
        const absPath = path.join(window.siyuan.config.system.workspaceDir, 'data', 'plugins')
        // shell.showItemInFolder(absPath);
        shell.openExternal(absPath);
    }

    async setUsername(username) {
        this.config.username = username;
        this.saveConfig();
    }

    async saveConfig() {
        await this.saveData('config.json', JSON.stringify(this.config));
    }

    async loadConfig() {
        this.config = await this.loadData('config.json');
        if (!this.config) {
            this.config = {
                'username': '',
                'vconsole': false,
            };
            this.saveConfig();
        } else {
            this.devtoolComponent.setUsername(this.config.username);
        }
    }
}