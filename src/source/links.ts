import type {
  AppInterface,
  sourceLinkInfo,
} from '@micro-app/types'
import { fetchSource } from './fetch'
import {
  CompletionPath,
  promiseStream,
  pureCreateElement,
  defer,
} from '../libs/utils'
import scopedCSS from './scoped_css'
import {
  dispatchOnLoadEvent,
  dispatchOnErrorEvent,
} from './load_event'

// 全局link，跨应用复用
export const globalLinks = new Map<string, string>()

/**
 * 提取link标签
 * @param link link标签
 * @param parent link父级容器
 * @param app 实例
 * @param microAppHead micro-app-head标签，初始化时必传
 * @param isDynamic 是否是动态插入
 */
export function extractLinkFromHtml (
  link: HTMLLinkElement,
  parent: Node,
  app: AppInterface,
  microAppHead: Element | null,
  isDynamic = false,
): any {
  const rel = link.getAttribute('rel')
  let href = link.getAttribute('href')
  let replaceComment: Comment | null = null
  if (rel === 'stylesheet' && href) {
    href = CompletionPath(href, app.url)
    if (!isDynamic) {
      replaceComment = document.createComment(`the link with href=${href} move to micro-app-head as style element`)
      const placeholderComment = document.createComment(`placeholder for link with href=${href}`)
      // style标签统一放入microAppHead
      microAppHead!.appendChild(placeholderComment)
      app.source.links.set(href, {
        code: '',
        placeholder: placeholderComment,
        isGlobal: link.hasAttribute('global'),
      })
    } else {
      return {
        url: href,
        info: {
          code: '',
          isGlobal: link.hasAttribute('global'),
        }
      }
    }
  } else if (href) {
    // preload prefetch modulepreload icon ....
    link.setAttribute('href', CompletionPath(href, app.url))
  }

  if (isDynamic) {
    return { replaceComment }
  } else if (replaceComment) {
    return parent.replaceChild(replaceComment, link)
  }
}

/**
 * 获取link远程资源
 * @param wrapElement 容器
 * @param app 应用实例
 * @param microAppHead micro-app-head
 */
export function fetchLinksFromHtml (
  wrapElement: HTMLElement,
  app: AppInterface,
  microAppHead: Element,
): void {
  const linkEntries: Array<[string, sourceLinkInfo]> = Array.from(app.source.links.entries())
  const fetchLinkPromise: Array<Promise<string>|string> = []
  for (const [url] of linkEntries) {
    const globalLinkCode = globalLinks.get(url)
    globalLinkCode ? fetchLinkPromise.push(globalLinkCode) : fetchLinkPromise.push(fetchSource(url, app.name))
  }

  promiseStream<string>(fetchLinkPromise, (res: {data: string, index: number}) => {
    fetchLinkSuccess(
      linkEntries[res.index][0],
      linkEntries[res.index][1],
      res.data,
      microAppHead,
      app,
    )
  }, (err: {error: Error, index: number}) => {
    console.error('[micro-app]', err)
  }, () => {
    app.onLoad(wrapElement)
  })
}

/**
 * 请求link资源成功，将placeholder替换为style标签
 * @param url 资源地址
 * @param info 资源详情
 * @param data 资源内容
 * @param microAppHead micro-app-head
 * @param app 应用实例
 */
export function fetchLinkSuccess (
  url: string,
  info: sourceLinkInfo,
  data: string,
  microAppHead: Element,
  app: AppInterface,
): void {
  if (info.isGlobal && !globalLinks.has(url)) {
    globalLinks.set(url, data)
  }

  const styleLink = pureCreateElement('style')
  styleLink.textContent = data
  styleLink.linkpath = url

  microAppHead.replaceChild(scopedCSS(styleLink, app.name), info.placeholder!)

  info.placeholder = null
  info.code = data
}

/**
 * 获取动态创建的link资源
 * @param url link地址
 * @param info info
 * @param app 应用实例
 * @param originLink 原link标签
 * @param replaceStyle style映射
 */
export function foramtDynamicLink (
  url: string,
  info: sourceLinkInfo,
  app: AppInterface,
  originLink: HTMLLinkElement,
  replaceStyle: HTMLStyleElement,
): void {
  if (app.source.links.has(url)) {
    replaceStyle.textContent = app.source.links.get(url)!.code
    scopedCSS(replaceStyle, app.name)
    defer(() => dispatchOnLoadEvent(originLink))
    return
  }

  if (globalLinks.has(url)) {
    const code = globalLinks.get(url)!
    info.code = code
    app.source.links.set(url, info)
    replaceStyle.textContent = code
    scopedCSS(replaceStyle, app.name)
    defer(() => dispatchOnLoadEvent(originLink))
    return
  }

  fetchSource(url, app.name).then((data: string) => {
    info.code = data
    app.source.links.set(url, info)
    if (info.isGlobal) globalLinks.set(url, data)
    replaceStyle.textContent = data
    scopedCSS(replaceStyle, app.name)
    dispatchOnLoadEvent(originLink)
  }).catch((err) => {
    console.error('[micro-app]', err)
    dispatchOnErrorEvent(originLink)
  })
}
