'use client'

import { useRouter } from 'next/navigation'
import { EmployeeProfileForm } from '@/components/payroll/EmployeeProfileForm'

export default function RegisterProfilePage() {
  const router = useRouter()

  return (
    <main className="w-full max-w-7xl px-1 pb-16">
      <EmployeeProfileForm
        mode="create"
        onCancelHref="/payroll/profiles"
        onSaved={(id) => {
          if (id) router.push(`/payroll/profiles/${id}`)
          else router.push('/payroll/profiles')
        }}
      />
    </main>
  )
}
