import { StoreDetailsView } from '@/components/store-details-view'

export default async function StoreDetailsPage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const { storeId } = await params

  return <StoreDetailsView storeId={storeId} />
}
