import { requirePageAccess } from '@/lib/viewer';
import FinanceModule from '../finance-module';
export default async function Page(){await requirePageAccess('variations');return <FinanceModule kind="variations"/>}
