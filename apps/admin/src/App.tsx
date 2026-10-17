import { useTranslation } from 'react-i18next'
import { AppSidebar } from '@/components/app-sidebar'
import { LanguageSwitcher } from '@/components/language-switcher'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { matchRoute } from '@/routes'

function App() {
  const { t } = useTranslation()
  const route = matchRoute(window.location.pathname)

  return (
    <SidebarProvider>
      <AppSidebar activePath={route.path} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 backdrop-blur-xl transition-[width,height] ease-linear">
          <div className="flex items-center gap-2 px-4 md:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>{t(route.titleKey)}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto px-4 md:px-6">
            <LanguageSwitcher />
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
          <route.Page />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
