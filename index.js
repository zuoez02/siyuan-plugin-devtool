const { Plugin, openTab } = require('siyuan');

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
        await this.getPlugins();
    }

    getUserRepos(username) {
        if (!username) {
            return [];
        }
        const result = [];
        for (const p of this.plugins) {
            if (p.package.author === username) {
                const reponame = p.url.split('@')[0];
                const downloads = this.downloadCounts[reponame];
                result.push({
                    ...p,
                    type: 'plugin',
                    downloads: downloads && downloads.downloads,
                });
            }
        }
        for (const p of this.templates) {
            if (p.package.author === username) {
                const reponame = p.url.split('@')[0];
                const downloads = this.downloadCounts[reponame];
                result.push({
                    ...p,
                    type: 'template',
                    downloads: downloads && downloads.downloads,
                });
            }
        }
        for (const p of this.themes) {
            if (p.package.author === username) {
                const reponame = p.url.split('@')[0];
                const downloads = this.downloadCounts[reponame];
                result.push({
                    ...p,
                    type: 'theme',
                    downloads: downloads && downloads.downloads,
                });
            }
        }
        for (const p of this.widgets) {
            if (p.package.author === username) {
                const reponame = p.url.split('@')[0];
                const downloads = this.downloadCounts[reponame];
                result.push({
                    ...p,
                    type: 'widget',
                    downloads: downloads && downloads.downloads,
                });
            }
        }
        return result;
    }

    async getSiyuanVersions() {
        this.version = await fetch(`${Constants.AliyunServer}/apis/siyuan/version?ver=${version}`, { method: 'GET' }).then((res) => res.json())
        this.bazaarHash = this.version.bazaar;
    }

    async getPlugins() {
        return Promise.all([
            fetch(`${Constants.BazaarOSSServer}/bazaar@${this.bazaarHash}/stage/plugins.json`).then((res) => res.json()),
            fetch(`${Constants.BazaarOSSServer}/bazaar@${this.bazaarHash}/stage/templates.json`).then((res) => res.json()),
            fetch(`${Constants.BazaarOSSServer}/bazaar@${this.bazaarHash}/stage/themes.json`).then((res) => res.json()),
            fetch(`${Constants.BazaarOSSServer}/bazaar@${this.bazaarHash}/stage/widgets.json`).then((res) => res.json()),
        ]).then((arr) => {
            this.plugins = arr[0].repos;
            this.templates = arr[1].repos;
            this.themes = arr[2].repos;
            this.widgets = arr[3].repos;
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
        const style = document.createElement('style');
        style.innerHTML = `
<style>
.devtool-plugin-tab dd {
    display: inline-block;
    color: red;
}
.devtool-plugin-tab dt {
    font-weight: bold;
    display: inline-block;
}
</style>`
        document.head.append(style);
    }

    mountEl() {
        const c = this;
        Vue.createApp({
            data: () => ({ vm: new VersionManager(), username: c.username || '', tempUsername: c.username || '', userRepos: [] }),
            async created() {
                await this.vm.init();
                const result = await this.vm.getUserRepos(this.username);
                this.userRepos = result;
            },
            methods: {
                async update() {
                    c.updateUsername(this.tempUsername);
                    this.username = this.tempUsername;
                    if (!this.username) {
                        return;
                    }
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
                    return this.userRepos.reduce((a, i) => (i.downloads || 0) + a, 0);
                },
            },
            template: `
            <div class="devtool-plugin-tab" style="padding: 12px">
                <h1>Developer Tools</h1>
                <div style="margin: 12px 0 5px">
                    <span>username:</span>
                    <input v-model="tempUsername"/>
                    <button v-on:click="update">Save</button>
                </div>
                <div v-if="username" style="display: flex; flex-wrap: wrap;">
                    <h2 style="margin: 12px 0 5px; width: 100%">Repos</h2>
                    <div style="margin: 6px 0; width: 100%">Total Downloads: {{total}}</div>
                    <template v-for="p in userRepos">
                        <div v-if="p.package.author === username" style="margin: 8px 0; width: 50%">
                            <div><dt>Name:&nbsp</dt><dd style="display: inline-block"><a :href="p.package.url" target="_blank">{{p.package.name}}</a></dd></div>
                            <div><dt>Type:&nbsp</dt><dd :style="getStyle(p.type)">{{p.type}}</dd></div>
                            <div><dt>Download:&nbsp</dt><dd style="display: inline-block">{{p.downloads}}</dd></div>
                            <div><dt>Version:&nbsp</dt><dd style="display: inline-block">{{p.package.version}}</dd></div>
                        </div>
                    </template>
                </div>
            </div>
            `
        }).mount(this.el);
    }
}


module.exports = class OpenMd extends Plugin {
    onload() {
        this.devtoolComponent = new DevlToolComponent(this);
        this.loadConfig();
        this.registerTopbarIcon();
    }

    registerTopbarIcon() {
        this.addTopBar({
            title: 'Siyuan开发者工具',
            icon: 'iconBug',
            position: 'right',
            callback: () => {
                this.showDevTool();
            },
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