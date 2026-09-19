'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { MetricCard } from '@/components/shared/MetricCard'
import { productionService } from '@/services/productionService'
import { payrollService } from '@/services/payrollService'
import { expenseService } from '@/services/expenseService'
import { formatNumber } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'

export default function DashboardPage() {
  const { canViewAccounts, isQualityController } = useAuth()
  const [stats, setStats] = useState({
    dailyMeters: 4004,
    efficiency: 69.8,
    runningLooms: 34,
    monthlyMeters: 31460,
    payrollTotal: 0,
    conversionCost: 0,
    pettyCash: 0,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const summary = await productionService.getFloorSummary()
        const cost = expenseService.buildCostStatement('2026-08')
        const salaries = Object.values(cost.salariesAndWages).reduce(
          (s, v) => s + (Number(v) || 0),
          0
        )
        const contractors = cost.contractorsBills.reduce((s, c) => s + (c.amount || 0), 0)
        let payrollTotal = salaries + contractors
        try {
          const grand = payrollService.getMonthlyGrandSummary('2026-08')
          payrollTotal =
            Number(grand.fortnight1Total || 0) + Number(grand.fortnight2Total || 0) ||
            Number(grand.monthlyTotalSalary) ||
            payrollTotal
        } catch {
          // keep rollup from cost statement
        }

        if (cancelled) return
        setStats({
          dailyMeters: summary.grandTotalMeters,
          efficiency: summary.averageEfficiency,
          runningLooms: summary.runningLooms,
          monthlyMeters: summary.monthlyProduction ?? 31460,
          payrollTotal,
          conversionCost:
            salaries +
            contractors +
            (cost.pettyCash || 0) +
            (cost.powerAndLight || 0),
          pettyCash: cost.pettyCash || 0,
        })
      } catch {
        // keep defaults
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <PageHeader
        title="Dashboard"
        breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Dashboard' }]}
      />

      <div className="row">
        <div className="col-lg-3 col-6">
          <MetricCard
            title="Daily Floor Production"
            value={`${formatNumber(stats.dailyMeters, 0)} m`}
            biIcon="bi-layers-fill"
            colorVariant="primary"
            href="/floor/production"
          />
        </div>
        <div className="col-lg-3 col-6">
          <MetricCard
            title="Running Efficiency"
            value={`${stats.efficiency.toFixed(1)}%`}
            biIcon="bi-speedometer"
            colorVariant="success"
            href="/floor/production"
          />
        </div>
        <div className="col-lg-3 col-6">
          <MetricCard
            title="Active Looms"
            value={`${stats.runningLooms} / 34`}
            biIcon="bi-gear-wide-connected"
            colorVariant="warning"
            href="/floor/production"
          />
        </div>
        <div className="col-lg-3 col-6">
          <MetricCard
            title="Monthly Production"
            value={`${formatNumber(stats.monthlyMeters, 0)} m`}
            biIcon="bi-graph-up-arrow"
            colorVariant="danger"
            href="/floor/production?tab=matrix"
          />
        </div>
      </div>

      {!isQualityController && canViewAccounts && (
        <div className="row">
          <div className="col-lg-4 col-6">
            <MetricCard
              title="Payroll Rollup"
              value={formatNumber(stats.payrollTotal, 0)}
              biIcon="bi-cash-stack"
              colorVariant="info"
              href="/payroll/synopsis"
            />
          </div>
          <div className="col-lg-4 col-6">
            <MetricCard
              title="Cost Statement (Core)"
              value={formatNumber(stats.conversionCost, 0)}
              biIcon="bi-calculator"
              colorVariant="secondary"
              href="/accounts/cost-statement"
            />
          </div>
          <div className="col-lg-4 col-12">
            <MetricCard
              title="Petty Cash Outflow"
              value={formatNumber(stats.pettyCash, 0)}
              biIcon="bi-wallet2"
              colorVariant="primary"
              href="/accounts/petty-cash"
            />
          </div>
        </div>
      )}

      <div className="row">
        <div className="col-md-6">
          <div className="card mb-4">
            <div className="card-header">
              <h3 className="card-title">Quick Links</h3>
            </div>
            <div className="card-body p-0">
              <ul className="nav flex-column">
                <li className="nav-item">
                  <a href="/floor/production" className="nav-link">
                    Daily Production
                  </a>
                </li>
                <li className="nav-item">
                  <a href="/floor/challan" className="nav-link">
                    Delivery Challan
                  </a>
                </li>
                {!isQualityController && canViewAccounts && (
                  <>
                    <li className="nav-item">
                      <a href="/accounts/cost-statement" className="nav-link">
                        Cost Statement
                      </a>
                    </li>
                    <li className="nav-item">
                      <a href="/payroll/employees" className="nav-link">
                        General Wages
                      </a>
                    </li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card mb-4">
            <div className="card-header">
              <h3 className="card-title">Mill Status</h3>
            </div>
            <div className="card-body">
              <p className="mb-2">
                <strong>Sara Textile</strong> — 34 Rapier &amp; PU looms
              </p>
              <p className="text-body-secondary mb-0 small">
                Stats refresh from live Floor, Payroll, and Accounts sheets. Open a module from
                the sidebar to edit registers.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
