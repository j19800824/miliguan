import { Button } from "@miliguan/ui";

const quickActions = [
  { title: "扫码核销", value: "Ready" },
  { title: "当班订单", value: "28" },
  { title: "库存提醒", value: "3" }
];

export function App() {
  return (
    <main className="page">
      <section className="panel">
        <div>
          <span className="eyebrow">Store App</span>
          <h1>米粒冠门店端 App</h1>
          <p>这里预留给门店员工使用的安卓应用，后续可承接扫码、核销、订单处理和门店日常操作。</p>
        </div>
        <Button label="进入门店工作台" variant="secondary" />
      </section>

      <section className="stats">
        {quickActions.map((item) => (
          <article key={item.title} className="stat-card">
            <span>{item.title}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>
    </main>
  );
}
