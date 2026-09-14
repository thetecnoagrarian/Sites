export const parsePageNumber = (value) => {
    if (value === undefined) {
        return 1;
    }

    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
        return null;
    }

    const page = Number(value);
    return Number.isSafeInteger(page) ? page : null;
};

export const buildPagination = ({ currentPage, totalItems, limit, basePath, query = {} }) => {
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    if (currentPage > totalPages) {
        return null;
    }

    const getPageUrl = (page) => {
        const params = new URLSearchParams();

        for (const [key, value] of Object.entries(query)) {
            if (typeof value === 'string' && value.length > 0) {
                params.set(key, value);
            }
        }

        if (page > 1) {
            params.set('page', String(page));
        }

        const queryString = params.toString();
        return queryString ? `${basePath}?${queryString}` : basePath;
    };

    return {
        currentPage,
        totalPages,
        currentUrl: getPageUrl(currentPage),
        previousUrl: currentPage > 1 ? getPageUrl(currentPage - 1) : null,
        nextUrl: currentPage < totalPages ? getPageUrl(currentPage + 1) : null,
        hasMultiplePages: totalPages > 1,
        pages: Array.from({ length: totalPages }, (_, index) => {
            const number = index + 1;
            return {
                number,
                url: getPageUrl(number),
                isCurrent: number === currentPage
            };
        })
    };
};
