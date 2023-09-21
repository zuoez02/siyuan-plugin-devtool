const { Plugin, openTab, Menu } = require('siyuan');

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
            const reponame = p.url.split('@')[0];
            const author = reponame.split('/')[0];
            return {
                ...p,
                username: author,
                type: p.type,
                downloads: this.downloadCounts[reponame].downloads,
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
        this.mountEl();
    }

    setUsername(username) {
        this.username = username;
    }

    updateUsername(username) {
        this.username = username;
        this.plugin.setUsername(this.username);
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
                    tempUsername: c.username || '',
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
                    c.updateUsername(this.tempUsername);
                    this.username = this.tempUsername;
                    const result = await this.vm.getUserRepos(this.username);
                    this.userRepos = result;
                },
                getStyle(type) {
                    return {
                        color: 'white',
                        backgroundColor: ['red', 'blue', 'orange', 'green'][
                            ['theme', 'template', 'plugin', 'widget'].findIndex((v) => v === type)
                        ],
                        border: '0',
                        borderRadius: '4px',
                        padding: '4px 2px',
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
                            <div class="user-repo">
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
    onload() {
        this.devtoolComponent = new DevlToolComponent(this);
        this.loadConfig();
        this.registerTopbarIcon();

        this.addCommand({
            langKey: "reload",
            hotkey: "⇧⌘R",
            callback: () => {
                window.location.reload();
            }
        });

    }

    registerTopbarIcon() {
        const topBarElement = this.addTopBar({
            title: 'Siyuan开发者工具',
            icon: 'iconBug',
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
            label: "重载",
            click: () => window.location.reload(),
        });
        menu.addItem({
            icon: "iconBug",
            label: "开发者工具",
            click: () => this.showDevTool(),
        });
        menu.open({
            x: rect.right,
            y: rect.bottom,
            isLeft: true,
        });
    }

    showDevTool() {
        let component = this.devtoolComponent;
        const tab = this.addTab({
            type: `devtool-plugin`,
            init() {
                component.init(this.element);
            }
        });
        openTab({
            custom: {
                icon: '',
                title: 'Siyuan开发者工具',
                data: {},
                fn: tab,
            },
        });
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
                'username': ''
            };
            this.saveConfig();
        } else {
            this.devtoolComponent.setUsername(this.config.username);
        }
    }
}