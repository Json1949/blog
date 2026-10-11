import { patchMeta, loadMeta, saveCategory, savePost } from './db.js'
import { mentionMarkdown } from './mentions.js'

export const RED_BLOG_ID = 'b1000001-0000-4000-8000-000000000001'

const NOTE_DEFS = [
  {
    n: 101,
    key: 'host',
    title: '主机发现',
    body: `主机发现回答的是“目标在哪”，还不是“它开了什么”。

实验网里通常不止一台机器。先看自己的地址落在哪一段，再把这一段里的机器过一遍，才不会把旁边的机器当成要看的那一台。

做到这一步，只知道有一台机器在。它对外提供什么，是下一步的事。`,
  },
  {
    n: 102,
    key: 'ports',
    title: '端口与服务识别',
    body: `端口是机器对外开着的门。识别不只是看门开没开，还要看门后面是远程登录、网站，还是别的服务。

软件版本用来判断该从哪一类入口看，不能代替把页面和配置读一遍。这台机器上后来用上的，是远程登录和网站这两扇门。网站软件是 WordPress，页面标题已经写成被改过。`,
  },
  {
    n: 103,
    key: 'vhost',
    title: '虚拟主机',
    body: `同一台网站服务器可以按访问时用的名字，给出不同的网站。只用数字地址打开时，服务器不知道你要哪一个，页面就会不完整。

名字常常藏在页面源码的链接里。把这个名字记到自己电脑上、指向那台机器，页面才按准备好的样子出现。`,
  },
  {
    n: 104,
    key: 'dir',
    title: '目录枚举',
    body: `网站上有些文件不会出现在导航里。目录枚举是拿一份常见文件名，逐个去问服务器在不在。

词表要跟着线索选。页面已经说站被改过，就优先试那些常被留下的隐藏页面。状态码也有信息：不存在是一种，文件在、但当前访问让它执行出错是另一种。`,
  },
  {
    n: 105,
    key: 'lfi',
    title: '本地文件包含',
    body: `有的页面会把传来的路径，拿去包含或读取服务器自己磁盘上的文件。这叫本地文件包含。

直接后果是泄密：系统有哪些用户、网站配置里的口令、程序源码和注释。它不等于已经可以在服务器上执行任意命令。这台机器上，那个可疑页面的实际行为就是读文件，而不是一个现成的命令入口。`,
  },
  {
    n: 106,
    key: 'traversal',
    title: '路径穿越',
    body: `网站本来只该读自己目录里的文件。路径穿越是在路径里走回上一级，跳出这个目录，去读不该给访客看的文件。

常用的验证，是读一份系统自己的用户名单。这份名单一般没有口令，但能告诉你谁可以登录，谁只是占着一个家目录。`,
  },
  {
    n: 107,
    key: 'config',
    title: '配置与源码泄露',
    body: `能读文件之后，更有价值的通常不是网页正文，而是程序配置和源码。配置里有数据库账号和口令，源码和注释里有程序怎么处理输入，有时还有作者留下的下一句提示。

WordPress 的数据库配置放在网站目录里一个固定名字的文件中。能读到它，网站口令就不再是秘密。这台机器的注释还说明：这句话不能原样拿去登录。`,
  },
  {
    n: 108,
    key: 'reuse',
    title: '口令复用',
    body: `同一句话被用在两个地方，知道其中一个，就该想到另一个可能相同，或者只差一点点。

这台机器上，数据库用户和系统里能登录的是同一个人。口令因此从网站配置，走到了远程登录。中间没有新的漏洞，只是把已经泄露的秘密用到了另一个开着的服务上。`,
  },
  {
    n: 109,
    key: 'rules',
    title: '口令规则变形',
    body: `已知一句口令，不一定能原样登录。规则变形是按固定习惯把这句话变出许多句：改大小写、做字符替换、在头尾加上符号或数字。

展开在自己的电脑上完成，只把很少的候选拿去试登录。注释如果提示“要按规则来”，就是在说原句不够，还差一次这种变形。这台机器上，能登录的那句就是在原口令上做了一点规则能预见的改动。`,
  },
  {
    n: 110,
    key: 'sudo',
    title: 'sudo 授权过宽',
    body: `sudo 规则要同时看三件事：能以谁的身份运行、能运行哪个程序、要不要密码。

如果允许运行的程序还能再启动一个命令行，效果就接近允许直接换成那个用户。规则写成免密、以另一个用户、运行某个看起来无害的程序，而这个程序又没有被限制成只能做一件固定的事，身份就会被换掉。

换过去之后还要核对家目录里的东西是不是真的。这台机器在中间用户家里放了假线索，真正的用户记录在另一个当时还进不去的目录里。`,
  },
  {
    n: 111,
    key: 'group',
    title: '组可写目录',
    body: `文件权限不只有拥有者和其他人。同组的人也可以被单独授予读写。

一个用户如果属于某个组，而网站目录里的文件对这个组可写，他就不必先变成最高权限，也能改掉这份文件。接下来要问的是：谁会执行刚被改掉的东西。`,
  },
  {
    n: 112,
    key: 'watch',
    title: '进程观察',
    body: `还没有最高权限时，仍然可以看这台机器上刚刚启动了哪些命令。定时任务一跑，就能看到谁在编译、编译的是哪份文件、编译完有没有立刻运行。

看到高权限在运行一份低权限用户能改的文件，后面的路径就清楚了。观察本身不改系统，它只是把已经发生的行为读出来。`,
  },
  {
    n: 113,
    key: 'cron',
    title: '计划任务信任边界',
    body: `高权限的定时任务应该只编译、只执行管理员自己能控制的文件。

如果它执行的是低权限用户能改的路径，改文件的人就借到了这次执行的身份。这台机器上，最高权限会周期性地编译并运行一份源码，而这份额代码所在的目录，前面那个中间用户正好能写。

等下一次任务跑起来，执行身份就是最高权限。用户记录和最高权限的记录分属不同的人，中间的登录身份只是跳板。`,
  },
]

function noteId(n) {
  return `b1000001-0000-4000-8000-${String(n).padStart(12, '0')}`
}

export function buildRedPosts({ knowledgeCategoryId, blogCategoryId, now = Date.now() }) {
  const notes = NOTE_DEFS.map((def, index) => ({
    id: noteId(def.n),
    key: def.key,
    title: def.title,
    content: def.body,
    categoryId: knowledgeCategoryId,
    createdAt: now - (index + 2) * 1000,
    updatedAt: now - (index + 1) * 1000,
  }))
  const byKey = Object.fromEntries(notes.map((note) => [note.key, note]))
  const link = (key) => mentionMarkdown(byKey[key].title, byKey[key].id)
  const article = {
    id: RED_BLOG_ID,
    title: 'Red 靶机的破解流程',
    categoryId: blogCategoryId,
    createdAt: now - 1000,
    updatedAt: now,
    content: `这是一场写好的红蓝对抗。Blue 要走进 Red 的系统。路径不靠一个没公开的漏洞编号，而是一条接一条的线索：先找到机器，再看网站上故意留下的话，最后顺着错误的权限走到最高身份。

## 先找到它

实验网里不只有一台机器。先做${link('host')}，确认自己在哪一段地址里，再把这一段过一遍。接着做${link('ports')}，看清开着的两扇门：一扇是远程登录，一扇是网站。网站是 WordPress，标题已经写成被 Red 改过。

直接用地址打开网页，页面是不完整的。源码里写着一个主机名，补上之后页面才正常。这是${link('vhost')}：服务器按名字决定给你看哪一个站。

页面上的话很直白。Red 在嘲讽，还暗示站里有别的东西。

## 网站上的入口

既然页面说站被改过，就按常见的隐藏文件名做${link('dir')}。试出来一个奇怪的页面。它不是一个能直接下命令的入口，而是把传来的路径拿去读服务器上的文件。这是${link('lfi')}。

要确认这一点，得走出网站自己的目录，去读一份系统才该看的用户名单。这是${link('traversal')}。名单里有的人可以登录，有的人只是占着一个家目录。

同一个读文件的能力，还能把这段程序的源码和 WordPress 的配置读出来。配置里有数据库口令，源码注释里有下一句提示。这是${link('config')}。

## 口令不能原样用

注释的意思是：这句话本身登不上，要按规则变一变。数据库用户和系统里能登录的是同一个人，所以这是${link('reuse')}，网站口令被拿去试远程登录。

变形在自己的电脑上完成，只把很少的候选拿去试。能登录的那句，是在原口令上做了一点规则能预见的改动。这是${link('rules')}。

登进去以后，作者还在捣乱：过一会儿踢掉这次登录，换掉口令，再让编辑器不好用。这些是剧本，不是登录服务本身坏了。绑在这次登录上的操作做不完，后面的检查要赶在被打断之前看清楚。

## 离开第一个用户

第一个用户的规则允许他以免密、以另一个用户的身份运行一个本来只是计时的程序。规则没有把这个程序限制成只能计时某一条固定命令。能再启动一个命令行的话，身份就换成了规则里写的那个人。这是${link('sudo')}。

换成的那个人家里有一份假记录。真正的用户记录在另一个还进不去的家目录里。

## 最后一步

这个中间用户所在的组，能改网站目录里的一份源码。这是${link('group')}。用${link('watch')}可以看到，最高权限会周期性地编译并运行这同一份源码。低权限的人能改，高权限的人会跑，信任就断了。这是${link('cron')}。

等下一次任务执行，回来的身份是最高权限。用户记录在之前进不去的那个家目录，最高权限的记录在它自己的目录。中间两个身份都只是跳板。

## 这条链在教什么

| 阶段 | 实际发生的事 | 知识点 |
| --- | --- | --- |
| 找到机器 | 在网段里认出目标，看清开着的服务 | ${link('host')}、${link('ports')} |
| 看网站 | 补上主机名，页面提示有隐藏入口 | ${link('vhost')}、${link('dir')} |
| 读文件 | 网站把路径当成服务器上的文件去读 | ${link('lfi')}、${link('traversal')}、${link('config')} |
| 登录 | 数据库口令按规则变形后才能用 | ${link('reuse')}、${link('rules')} |
| 换身份 | 一个没写死的程序被用来换成另一个用户 | ${link('sudo')} |
| 到最高权限 | 能改的源码被高权限任务编译执行 | ${link('group')}、${link('watch')}、${link('cron')} |
`.replace(/\)([，。：、])/g, ')\u2060$1'),
  }
  return {
    notes: notes.map(({ key: _key, ...post }) => post),
    article,
  }
}

export async function seedRedWalkthrough(posts, categories) {
  const meta = await loadMeta()
  if (meta.redSeeded) return null
  let nextCategories = categories.slice()
  let knowledge = nextCategories.find((category) => category.name === '知识点')
  let blog = nextCategories.find((category) => category.name === '博客')
  if (!knowledge) {
    knowledge = { id: crypto.randomUUID(), name: '知识点', createdAt: Date.now() }
    await saveCategory(knowledge)
    nextCategories = [...nextCategories, knowledge]
  }
  if (!blog) {
    blog = { id: crypto.randomUUID(), name: '博客', createdAt: Date.now() }
    await saveCategory(blog)
    nextCategories = [...nextCategories, blog]
  }
  const { notes, article } = buildRedPosts({
    knowledgeCategoryId: knowledge.id,
    blogCategoryId: blog.id,
  })
  const existing = new Set(posts.map((post) => post.id))
  const fresh = []
  for (const post of [...notes, article]) {
    if (existing.has(post.id)) continue
    await savePost(post)
    fresh.push(post)
  }
  await patchMeta({ redSeeded: true })
  const merged = [...posts.filter((post) => !fresh.some((item) => item.id === post.id)), ...fresh]
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return {
    posts: merged,
    categories: nextCategories,
    blogId: article.id,
    created: fresh.length > 0,
  }
}
