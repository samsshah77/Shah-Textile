export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/adminlte/css/adminlte.min.css" />
      <link rel="stylesheet" href="/adminlte/css/adminlte-colors.min.css" />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css"
      />
      {children}
    </>
  )
}
