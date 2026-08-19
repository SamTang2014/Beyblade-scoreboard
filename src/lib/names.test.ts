import { describe, expect, it } from 'vitest'
import { rosterText, splitNames } from './names'

describe('拆名', () => {
  it('一個名就一個', () => {
    expect(splitNames('阿明')).toEqual(['阿明'])
  })

  it('換行拆一串名', () => {
    expect(splitNames('阿明\n阿強\n阿樂')).toEqual(['阿明', '阿強', '阿樂'])
  })

  it('windows 換行（\\r\\n）都得', () => {
    expect(splitNames('阿明\r\n阿強')).toEqual(['阿明', '阿強'])
  })

  it('逗號、全形逗號、頓號都係分隔符', () => {
    expect(splitNames('阿明,阿強，阿樂、細B')).toEqual(['阿明', '阿強', '阿樂', '細B'])
  })

  it('名入面嘅空格唔郁 —— 唔會當分隔符', () => {
    expect(splitNames('阿 May\n細 B')).toEqual(['阿 May', '細 B'])
  })

  it('頭尾空白剪走，空行空項唔理', () => {
    expect(splitNames('  阿明 \n\n 阿強  \n')).toEqual(['阿明', '阿強'])
  })

  it('串入面自己重複，後嗰個唔要', () => {
    expect(splitNames('阿明\n阿強\n阿明')).toEqual(['阿明', '阿強'])
  })

  it('乜都冇就吉', () => {
    expect(splitNames('')).toEqual([])
    expect(splitNames(' \n , 、')).toEqual([])
  })
})

describe('名單出 text', () => {
  it('照 seat 次序，一行一個名', () => {
    expect(
      rosterText([
        { name: '阿強', seat: 1 },
        { name: '阿明', seat: 0 },
      ]),
    ).toBe('阿明\n阿強')
  })

  it('copy 出嚟嘅嘢 splitNames 食得返', () => {
    const players = [
      { name: '阿 May', seat: 0 },
      { name: '細B', seat: 1 },
    ]
    expect(splitNames(rosterText(players))).toEqual(['阿 May', '細B'])
  })
})
