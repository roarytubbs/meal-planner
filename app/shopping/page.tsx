import { ShoppingModeView } from '@/components/shopping-mode-view'
import { Toaster } from '@/components/ui/sonner'

export default function ShoppingPage() {
  return (
    <main>
      <ShoppingModeView standalone />
      <Toaster />
    </main>
  )
}
