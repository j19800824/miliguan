import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type BusinessPageProps = {
  title: string;
  description: string;
  summary: string[];
  nextSteps: string[];
};

export function BusinessPage({ title, description, summary, nextSteps }: BusinessPageProps) {
  return (
    <PageContainer pageTitle={title} pageDescription={description}>
      <div className='grid gap-4 lg:grid-cols-[1.5fr_1fr]'>
        <Card>
          <CardHeader>
            <CardTitle>当前模块定位</CardTitle>
            <CardDescription>这里已经接入米粒冠后台导航，可继续承接真实接口与表格表单。</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {summary.map((item) => (
              <div key={item} className='rounded-lg border p-3 text-sm leading-6'>
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>下一步建议</CardTitle>
            <CardDescription>按一期后台优先级逐个落地。</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            {nextSteps.map((item, index) => (
              <div key={item} className='flex items-start gap-3 rounded-lg border p-3'>
                <Badge variant='outline'>{index + 1}</Badge>
                <p className='text-sm leading-6'>{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
