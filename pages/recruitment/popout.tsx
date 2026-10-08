import { withContentPage } from '@/lib/content/server';
import RecruitmentTool from '@/components/recruitment/RecruitmentTool';
import { getRecruitmentPageProps, recruitmentTables, type RecruitmentProps } from '@/lib/gacha/recruitmentPageData';

export default function RecruitmentPopout(props: RecruitmentProps) {
  return <RecruitmentTool {...props} compact />;
}

RecruitmentPopout.hideSiteChrome = true;

export const getStaticProps = withContentPage("/recruitment/popout", getRecruitmentPageProps, { tables: recruitmentTables });
