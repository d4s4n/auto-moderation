async function getUiPageContent({ bot, settings }) {
    return {
        layout: {
            type: 'Grid',
            columns: 1,
            gap: 6,
            children: [
                {
                    type: 'Card',
                    children: [
                        { type: 'CardHeader', title: 'Активные нарушители' },
                        {
                            type: 'CardContent',
                            children: [
                                {
                                    type: 'Table',
                                    dataKey: 'violators',
                                    component_id: 'violators-table',
                                    rowKey: 'id',
                                    columns: [
                                        { header: 'Игрок', dataKey: 'username' },
                                        { header: 'Нарушения', dataKey: 'count' },
                                        { header: 'Последняя причина', dataKey: 'lastReason' },
                                        {
                                            header: 'Действия',
                                            type: 'actions',
                                            actions: [
                                                { label: 'Сбросить', action: 'clear-violations', variant: 'destructive', row_id_key: 'id' }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        data: {
            violators: []
        }
    };
}


module.exports = { getUiPageContent };
