import { withContentPage } from '@/lib/content/server';
import RecruitmentTool from '@/components/recruitment/RecruitmentTool';
import { getRecruitmentPageProps, type RecruitmentProps } from '@/lib/gacha/recruitmentPageData';

export default function RecruitmentPage(props: RecruitmentProps) {
  return <RecruitmentTool {...props} />;
}

export const getStaticProps = withContentPage("/recruitment", getRecruitmentPageProps);
