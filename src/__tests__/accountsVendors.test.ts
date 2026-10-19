import { describe, it, expect, beforeEach } from 'vitest'
import { expenseService } from '@/services/expenseService'
import { slugifyPartyName } from '@/services/accounts/expenseSeeds'
import { ACCOUNTS_KEYS } from '@/lib/accountsKeys'
import { accountsWrite } from '@/services/accountsStore'

describe('Accounts Vendor Management & Ledger Separation', () => {
  beforeEach(() => {
    // Reset deleted lists and directory stores for testing
    accountsWrite(ACCOUNTS_KEYS.DELETED_TRADERS, [])
    accountsWrite(ACCOUNTS_KEYS.DELETED_WORKSHOPS, [])
  })

  it('slugifyPartyName handles varied strings consistently', () => {
    expect(slugifyPartyName('Ali Engineering Traders')).toBe('ali-engineering-traders')
    expect(slugifyPartyName('  Makkah   Workshop & Lathe  ')).toBe('makkah-workshop-lathe')
    expect(slugifyPartyName('Special #123 / Store')).toBe('special-123-store')
  })

  it('deleting a trader adds it to deleted list and excludes from getTradersList()', () => {
    const testTrader = expenseService.addNewTrader('Test Dynamic Trader', 'Trader', 'Temporary test')
    const initialList = expenseService.getTradersList()
    expect(initialList.some((t) => t.slug === testTrader.slug)).toBe(true)

    expenseService.deleteTrader(testTrader.slug)

    const deleted = expenseService.getDeletedTraders()
    expect(deleted.includes(testTrader.slug)).toBe(true)

    const updatedList = expenseService.getTradersList()
    expect(updatedList.some((t) => t.slug === testTrader.slug)).toBe(false)
  })

  it('deleting a workshop adds it to deleted list and excludes from getWorkshopsList()', () => {
    const testWs = expenseService.addNewWorkshop('Test Dynamic Lathe Workshop', 'Lathe', 'Temporary test')
    const initialList = expenseService.getWorkshopsList()
    expect(initialList.some((w) => w.slug === testWs.slug)).toBe(true)

    expenseService.deleteWorkshop(testWs.slug)

    const deleted = expenseService.getDeletedWorkshops()
    expect(deleted.includes(testWs.slug)).toBe(true)

    const updatedList = expenseService.getWorkshopsList()
    expect(updatedList.some((w) => w.slug === testWs.slug)).toBe(false)
  })

  it('recordUnifiedMasterBill with isWorkshop: false keeps party as Trader even if name contains "engineering"', () => {
    const traderName = 'Apex Textile Engineering Supplies'
    const traderSlug = slugifyPartyName(traderName)

    expenseService.recordUnifiedMasterBill({
      date: '2026-10-15',
      partyName: traderName,
      billNo: 'BILL-ENG-101',
      inwardNo: 'INW-101',
      items: [
        { description: 'Bearing 6200', machineName: 'G-6200', quantity: 2, rate: 500, totalAmount: 1000 },
      ],
      isWorkshop: false,
    })

    const trader = expenseService.getTraderBySlug(traderSlug)
    expect(trader).not.toBeNull()
    expect(trader?.partyName).toBe(traderName)

    const ws = expenseService.getWorkshopBySlug(traderSlug)
    expect(ws).toBeNull()
  })

  it('recordUnifiedMasterBill with isWorkshop: true places party into Workshop directory', () => {
    const wsName = 'Precision Lathe & Engineering Workshop'
    const wsSlug = slugifyPartyName(wsName)

    expenseService.recordUnifiedMasterBill({
      date: '2026-10-16',
      partyName: wsName,
      billNo: 'JOB-999',
      inwardNo: 'INW-999',
      items: [
        { description: 'Shaft Turning', machineName: 'PU', quantity: 1, rate: 4500, totalAmount: 4500 },
      ],
      isWorkshop: true,
    })

    const ws = expenseService.getWorkshopBySlug(wsSlug)
    expect(ws).not.toBeNull()
    expect(ws?.workshopName).toBe(wsName)
  })
})
