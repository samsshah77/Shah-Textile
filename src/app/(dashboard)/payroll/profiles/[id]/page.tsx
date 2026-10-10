'use client'

import { use } from 'react'
import { EmployeeProfileForm } from '@/components/payroll/EmployeeProfileForm'

export default function EditProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  return (
    <main className="w-full max-w-7xl px-1 pb-16">
      <EmployeeProfileForm mode="edit" employeeId={id} onCancelHref="/payroll/profiles" />
    </main>
  )
}
