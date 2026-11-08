import { describe, expect, it } from 'vitest'
import { pageCountFor, paginate, pagerItemsFor } from '@/lib/pagination'

describe('pageCountFor', () => {
  it('returns at least one page and rounds up', () => {
    expect(pageCountFor(0, 20)).toBe(1)
    expect(pageCountFor(20, 20)).toBe(1)
    expect(pageCountFor(21, 20)).toBe(2)
    expect(pageCountFor(25, 10)).toBe(3)
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, index) => index + 1)

  it('returns the requested slice', () => {
    expect(paginate(items, 1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(paginate(items, 3, 10)).toEqual([21, 22, 23, 24, 25])
  })

  it('clamps invalid pages and sizes', () => {
    expect(paginate(items, 0, 10)[0]).toBe(1)
    expect(paginate(items, 1, 0)).toEqual([1])
    expect(paginate(items, 99, 10)).toEqual([])
  })
})

describe('pagerItemsFor', () => {
  it('lists every page when there are seven or fewer', () => {
    expect(pagerItemsFor(1, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('adds gaps around the current page', () => {
    expect(pagerItemsFor(6, 20)).toEqual([1, 'gap', 5, 6, 7, 'gap', 20])
    expect(pagerItemsFor(2, 20)).toEqual([1, 2, 3, 'gap', 20])
    expect(pagerItemsFor(20, 20)).toEqual([1, 'gap', 19, 20])
  })
})
